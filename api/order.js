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
    let body;
    try {
        body = await req.json();
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { action, data = {} } = body;

    // ===================== HELPER: Panggil Telegram Langsung =====================
    async function sendTelegram(message) {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHATID;

        if (!BOT_TOKEN || !OWNER_CHAT_ID) {
            console.error('Telegram env not set');
            return;
        }

        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: OWNER_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        return response.json();
    }

    // ===================== HELPER: Panggil Pterodactyl =====================
    async function pterodactylRequest(endpoint, method = 'GET', body = null) {
        const PANEL_DOMAIN = process.env.PANEL_DOMAIN;
        const PANEL_APIKEY = process.env.PANEL_APIKEY;

        if (!PANEL_DOMAIN || !PANEL_APIKEY) {
            throw new Error('Server not configured');
        }

        const url = `${PANEL_DOMAIN}/api/application/${endpoint}`;
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PANEL_APIKEY}`
        };

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);
        const result = await response.json();
        return result;
    }

    // ===================== HELPER: Buat User Pterodactyl =====================
    async function createPterodactylUser(email, username) {
        const password = generatePassword();

        const userSearch = await pterodactylRequest(`users?filter[email]=${email}`);
        
        if (userSearch.data && userSearch.data.length > 0) {
            return {
                id: userSearch.data[0].attributes.id,
                email: email,
                username: username,
                password: password,
                isExisting: true
            };
        }

        const newUser = await pterodactylRequest('users', 'POST', {
            email: email,
            username: username,
            first_name: username,
            last_name: 'User',
            password: password
        });

        return {
            id: newUser.attributes.id,
            email: email,
            username: username,
            password: password,
            isExisting: false
        };
    }

    // ===================== HELPER: Buat Server Pterodactyl =====================
    async function createPterodactylServer(serverData) {
        const user = await createPterodactylUser(serverData.email, serverData.username);

        const serverPayload = {
            name: serverData.name,
            user: user.id,
            nest: 5,
            egg: 15,
            docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
            startup: 'npm start',
            limits: {
                memory: serverData.ram,
                swap: 0,
                disk: serverData.disk,
                io: 500,
                cpu: serverData.cpu
            },
            feature_limits: {
                databases: 1,
                allocations: 1,
                backups: 1
            },
            allocation: { default: 1 },
            environment: {
                SERVER_PORT: '25565',
                STARTUP: 'npm start'
            }
        };

        const server = await pterodactylRequest('servers', 'POST', serverPayload);

        return {
            server: server,
            user: user
        };
    }

    // ===================== HANDLE ACTIONS =====================
    switch (action) {
        case 'createOrder':
            try {
                const { serverName, ram, cpu, disk, price, priceLabel } = data;

                const username = serverName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10) || 'user';
                const email = `${username}@doopedia.my.id`;

                const order = {
                    orderId: 'ORD-' + Date.now(),
                    serverName,
                    ram,
                    cpu,
                    disk,
                    price,
                    priceLabel,
                    username,
                    email,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                };

                try {
                    await sendTelegram(`ORDER BARU!\n\nOrder ID: ${order.orderId}\nServer: ${order.serverName}\nPaket: ${order.ram}GB\nHarga: ${order.priceLabel}\n\nMenunggu pembayaran.`);
                } catch (telegramError) {
                    console.error('Telegram notif gagal:', telegramError);
                }

                return res.status(200).json({ success: true, data: order });
            } catch (error) {
                console.error('Error createOrder:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

        case 'confirmOrder':
            try {
                const { orderId, serverName, ram, cpu, disk, email, username } = data;

                const result = await createPterodactylServer({
                    name: serverName,
                    email: email,
                    username: username,
                    ram: ram,
                    cpu: cpu,
                    disk: disk
                });

                const serverData = {
                    panelUrl: process.env.PANEL_DOMAIN,
                    serverName: serverName,
                    username: username,
                    password: result.user.password,
                    serverId: result.server.attributes.id
                };

                try {
                    await sendTelegram(`Server ${serverName} berhasil dibuat!`);
                } catch (telegramError) {
                    console.error('Telegram notif gagal:', telegramError);
                }

                return res.status(200).json({ success: true, data: serverData });
            } catch (error) {
                console.error('Error confirmOrder:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

        case 'cancelOrder':
            try {
                const { orderId, reason } = data;

                try {
                    await sendTelegram(`Order ${orderId} dibatalkan. Alasan: ${reason}`);
                } catch (telegramError) {
                    console.error('Telegram notif gagal:', telegramError);
                }

                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: error.message });
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

// Helper: Generate random password
function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}
