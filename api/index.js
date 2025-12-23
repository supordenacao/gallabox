import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ljwvslifkwnjihacfcnu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqd3ZzbGlma3duamloYWNmY251Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA1ODAwMiwiZXhwIjoyMDgxNjM0MDAyfQ.HGY4h1ChTpPA76tzX9gO4zwvUC7EU5OIJW0DWT-_TXw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // PAUSE AUTOMÁTICO: 23:00 às 08:00 no HORÁRIO DO BRASIL (UTC-3)
  const nowUTC = new Date();
  const nowBrasil = new Date(nowUTC.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const hourBrasil = nowBrasil.getHours(); // 0-23 no horário de Brasília

  if (hourBrasil >= 23 || hourBrasil < 8) {
    console.log(`Pause ativo (23h-08h Brasil) - evento ignorado às ${hourBrasil}:00`);
    return res.status(200).json({ message: 'OK - pause horário Brasil' });
  }

  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ message: 'No payload' });

    const convId = payload.conversation?.id || payload.data?.conversation?.id || payload.conversationId;
    if (!convId) return res.status(400).json({ message: 'No conversation ID' });

    // Ignora mensagens do agente
    if (payload.message?.fromMe === true) {
      console.log(`Mensagem do agente ignorada: ${convId}`);
      return res.status(200).json({ message: 'OK - agent message' });
    }

    const contactName = payload.contact?.name || payload.conversation?.contact?.name || 'Sem nome';
    const status = payload.conversation?.status || 'OPEN';
    const tags = payload.conversation?.tags || payload.tags || [];
    const tagNames = tags.map(t => typeof t === 'string' ? t : t.name || '').filter(Boolean);

    // Detecta evento de criação
    const isCreationEvent = payload.event === 'conversation.created' ||
                            (payload.message?.text && payload.message.text.includes('Contact has initiated the conversation')) ||
                            (payload.text && payload.text.includes('Contact has initiated the conversation'));

    let createdAt = payload.conversation?.createdAt || payload.createdAt || payload.timestamp || new Date().toISOString();
    if (isCreationEvent && payload.timestamp) {
      createdAt = new Date(payload.timestamp * 1000).toISOString();
    }

    const lastMessageAt = payload.message?.timestamp ? new Date(payload.message.timestamp * 1000).toISOString() : new Date().toISOString();

    if (status === 'CLOSED' || status === 'closed') {
      const { error } = await supabase.from('open_conversations').delete().eq('id', convId);
      if (error) throw error;
      console.log(`Conversa fechada removida: ${convId}`);
      return res.status(200).json({ message: 'OK' });
    }

    // ================  COMECO DE BUSCA PARA COUNT  ===========================
let currentCount = 1; // primeira mensagem = count 1

    const { data: existingRow } = await supabase
      .from('open_conversations')
      .select('message_count')
      .eq('id', convId)
      .maybeSingle();

    if (existingRow) {
      currentCount = (existingRow.message_count || 0) + 1;
    }

    // Limite de 12 mensagens
    if (currentCount > 12) {
      console.log(`Limite de 12 mensagens atingido (${currentCount}) - ignorando: ${convId}`);
      return res.status(200).json({ message: 'OK - message limit reached' });
    }

    // Upsert com count correto
    const { error } = await supabase.from('open_conversations').upsert({
      id: convId,
      contact_name: contactName,
      created_at: finalCreatedAt,
      last_message_at: lastMessageAt,
      status: 'OPEN',
      tags: tagNames,
      message_count: currentCount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    if (error) throw error;
    console.log(`Mensagem processada - count: ${currentCount}/12 - convId: ${convId}`);

    // ==================== CAPTURA DE AVALIAÇÕES ====================
    try {
      // Caminhos múltiplos para interactive (Gallabox varia)
      let listReply = null;
      if (payload.interactive?.type === 'list_reply') {
        listReply = payload.interactive.list_reply;
      } else if (payload.message?.interactive?.type === 'list_reply') {
        listReply = payload.message.interactive.list_reply;
      } else if (payload.message?.whatsapp?.interactive?.type === 'list_reply') {
        listReply = payload.message.whatsapp.interactive.list_reply;
      } else if (payload.whatsapp?.interactive?.type === 'list_reply') {
        listReply = payload.whatsapp.interactive.list_reply;
      } else if (payload.latestMessage?.interactive?.type === 'list_reply') {
        listReply = payload.latestMessage.interactive.list_reply;
      }

      if (listReply && listReply.id?.startsWith('nota_')) {
        const rating = parseInt(listReply.id.replace('nota_', ''), 10);
        const conversationId = convId || payload.conversationId || payload.id || 'unknown';

        // Anti-duplicidade
        const { data: existingEval } = await supabase
          .from('evaluations')
          .select('id')
          .eq('conversation_id', conversationId)
          .limit(1);

        if (existingEval && existingEval.length > 0) {
          console.log(`Avaliação duplicada ignorada: ${conversationId} - Nota ${rating}`);
        } else {
          const analystName = payload.agent?.name ||
                              payload.assignee?.name ||
                              payload.user?.name ||
                              payload.whatsapp?.assignee?.name ||
                              payload.assignee?.whatsapp?.name ||
                              'Não identificado';

          let clientPhone = '';
          if (Array.isArray(payload.contact?.phone)) {
            clientPhone = payload.contact.phone[0] || '';
          } else if (payload.contact?.phone) {
            clientPhone = payload.contact.phone;
          } else if (payload.whatsapp?.from) {
            clientPhone = payload.whatsapp.from;
          } else if (payload.from) {
            clientPhone = payload.from;
          }

          const evaluation = {
            conversation_id: conversationId,
            analyst_name: analystName.trim(),
            client_name: (payload.contact?.name || payload.whatsapp?.from || payload.from || 'Anônimo').trim(),
            client_phone: clientPhone.replace('+', '').trim(),
            rating: rating,
            comment: (listReply.description || listReply.title || 'Sem comentário').trim(),
            timestamp: new Date().toISOString()
          };

          const { error } = await supabase.from('evaluations').insert(evaluation);
          if (error) console.error('Erro ao salvar avaliação:', error);
          else console.log(`AVALIAÇÃO SALVA: Nota ${rating} - ${conversationId} - ${analystName}`);
        }
      }
    } catch (evalError) {
      console.error('Erro ao processar avaliação:', evalError);
    }
    // ==============================================================================

    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Erro crítico:', error);
    res.status(500).json({ error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
