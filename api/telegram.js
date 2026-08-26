export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHATID;

    if (!BOT_TOKEN || !OWNER_CHAT_ID) {
        return res.status(500).json({ error: 'Server not configured' });
    }

    const { action, data } = req.body;
    const baseUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;

    async function sendMessage(chatId, message) {
        const url = `${baseUrl}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
        return response.json();
    }

    switch (action) {
        case 'notifyOwner':
            try {
                const message = data.message;
                const result = await sendMessage(OWNER_CHAT_ID, message);
                return res.status(200).json(result);
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        case 'notifyChannel':
            try {
                const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
                if (!CHANNEL_ID) {
                    return res.status(400).json({ error: 'Channel not configured' });
                }
                const message = data.message;
                const result = await sendMessage(CHANNEL_ID, message);
                return res.status(200).json(result);
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        case 'sendPhoto':
            try {
                const chatId = data.chatId || OWNER_CHAT_ID;
                const photoUrl = data.photoUrl;
                const caption = data.caption || '';
                const response = await fetch(`${baseUrl}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption, parse_mode: 'HTML' })
                });
                const result = await response.json();
                return res.status(200).json(result);
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        default:
            return res.status(400).json({ error: 'Unknown action' });
    }
}