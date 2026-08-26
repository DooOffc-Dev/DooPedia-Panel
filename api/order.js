export default async function handler(req, res) {
    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Cek method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Ambil body
    let body = {};
    try {
        const text = await req.text();
        if (text) {
            body = JSON.parse(text);
        }
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { action, data = {} } = body;

    // ===================== HANDLE ACTIONS =====================
    switch (action) {
        case 'createOrder':
            try {
                const { serverName, ram, cpu, disk, price, priceLabel } = data;

                const order = {
                    orderId: 'ORD-' + Date.now(),
                    serverName,
                    ram,
                    cpu,
                    disk,
                    price,
                    priceLabel,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                };

                return res.status(200).json({ success: true, data: order });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }

        case 'getOrder':
            try {
                const { orderId } = data;
                return res.status(200).json({ success: true, data: { orderId, status: 'pending' } });
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        case 'getBroadcast':
            try {
                return res.status(200).json({ success: true, data: { message: 'Selamat datang di DooPedia Marketplace!' } });
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        case 'setBroadcast':
            try {
                const { message } = data;
                return res.status(200).json({ success: true, data: { message } });
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        default:
            return res.status(400).json({ error: 'Unknown action' });
    }
}
