export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, data } = req.body;

    // ===================== HELPER: Panggil API Pterodactyl =====================
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

        // Cek apakah user sudah ada
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

        // Buat user baru
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

                // Generate data user
                const username = serverName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10) || 'user';
                const email = `${username}@doopedia.my.id`;
                
                // Simpan order ke database (opsional, bisa pake memory / db)
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

                // Kirim notifikasi ke owner via Telegram
                await fetch('/api/telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'notifyOwner',
                        data: { message: `ORDER BARU!\n\nOrder ID: ${order.orderId}\nServer: ${order.serverName}\nPaket: ${order.ram}GB\nHarga: ${order.priceLabel}\n\nMenunggu pembayaran.` }
                    })
                });

                return res.status(200).json({ success: true, data: order });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }

        case 'confirmOrder':
            try {
                const { orderId, serverName, ram, cpu, disk, email, username } = data;

                // Buat server Pterodactyl
                const result = await createPterodactylServer({
                    name: serverName,
                    email: email,
                    username: username,
                    ram: ram,
                    cpu: cpu,
                    disk: disk
                });

                // Data yang akan dikirim ke user
                const serverData = {
                    panelUrl: process.env.PANEL_DOMAIN,
                    serverName: serverName,
                    username: username,
                    password: result.user.password,
                    serverId: result.server.attributes.id
                };

                // Kirim notifikasi ke owner bahwa server berhasil dibuat
                await fetch('/api/telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'notifyOwner',
                        data: { message: `Server ${serverName} berhasil dibuat!` }
                    })
                });

                return res.status(200).json({ success: true, data: serverData });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }

        case 'cancelOrder':
            try {
                const { orderId, reason } = data;

                await fetch('/api/telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'notifyOwner',
                        data: { message: `Order ${orderId} dibatalkan. Alasan: ${reason}` }
                    })
                });

                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        case 'getOrder':
            try {
                const { orderId } = data;
                // Simulasi get order (bisa connect ke database)
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