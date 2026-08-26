export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, data } = req.body;

    const PANEL_DOMAIN = process.env.PANEL_DOMAIN;
    const PANEL_APIKEY = process.env.PANEL_APIKEY;

    if (!PANEL_DOMAIN || !PANEL_APIKEY) {
        return res.status(500).json({ error: 'Server not configured' });
    }

    async function pterodactylRequest(endpoint, method = 'GET', body = null) {
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

    // ===================== HELPER: Ambil Port Available dari Panel =====================
    async function getAvailablePort() {
        const allocations = await pterodactylRequest('allocations');
        
        if (allocations.data && allocations.data.length > 0) {
            const availablePorts = allocations.data
                .filter(a => {
                    const port = a.attributes.port;
                    return port >= 4000 && port <= 4999 && !a.attributes.assigned;
                })
                .map(a => a.attributes.port);
            
            if (availablePorts.length > 0) {
                const randomIndex = Math.floor(Math.random() * availablePorts.length);
                return availablePorts[randomIndex];
            }
        }
        
        return await createNewPort();
    }

    // ===================== HELPER: Buat Port Baru 4000-4999 =====================
    async function createNewPort() {
        const nodes = await pterodactylRequest('nodes');
        
        if (!nodes.data || nodes.data.length === 0) {
            throw new Error('No nodes available');
        }
        
        const nodeId = nodes.data[0].attributes.id;
        
        let port;
        let allocated = false;
        let attempts = 0;
        
        while (!allocated && attempts < 10) {
            port = Math.floor(Math.random() * (4999 - 4000 + 1)) + 4000;
            attempts++;
            
            try {
                const newAllocation = await pterodactylRequest('allocations', 'POST', {
                    node_id: nodeId,
                    ip: '0.0.0.0',
                    port: port
                });
                
                if (newAllocation.attributes) {
                    allocated = true;
                    return port;
                }
            } catch (e) {
                console.error('Port allocation failed, trying again:', e);
            }
        }
        
        throw new Error('Could not allocate port');
    }

    switch (action) {
        case 'createServer':
            try {
                const { name, email, ram, cpu, disk, username } = data;

                // Cek user
                const userSearch = await pterodactylRequest(`users?filter[email]=${email}`);
                let userId;

                if (userSearch.data && userSearch.data.length > 0) {
                    userId = userSearch.data[0].attributes.id;
                } else {
                    const password = generatePassword();
                    const newUser = await pterodactylRequest('users', 'POST', {
                        email: email,
                        username: username,
                        first_name: username,
                        last_name: 'User',
                        password: password
                    });
                    userId = newUser.attributes.id;
                }

                // Ambil port available
                const port = await getAvailablePort();

                // Buat server dengan port random 4000-4999
                const serverPayload = {
                    name: name,
                    user: userId,
                    nest: 5,
                    egg: 15,
                    docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
                    startup: 'npm start',
                    limits: {
                        memory: ram,
                        swap: 0,
                        disk: disk,
                        io: 500,
                        cpu: cpu
                    },
                    feature_limits: {
                        databases: 1,
                        allocations: 1,
                        backups: 1
                    },
                    allocation: { default: 1 },
                    environment: {
                        SERVER_PORT: port,
                        STARTUP: 'npm start'
                    }
                };

                const server = await pterodactylRequest('servers', 'POST', serverPayload);

                return res.status(200).json({
                    success: true,
                    data: {
                        serverId: server.attributes.id,
                        name: server.attributes.name,
                        panelUrl: PANEL_DOMAIN,
                        port: port
                    }
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }

        case 'getServer':
            try {
                const { serverId } = data;
                const server = await pterodactylRequest(`servers/${serverId}`);
                return res.status(200).json(server);
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        case 'deleteServer':
            try {
                const { serverId } = data;
                const result = await pterodactylRequest(`servers/${serverId}`, 'DELETE');
                return res.status(200).json({ success: true, data: result });
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }

        default:
            return res.status(400).json({ error: 'Unknown action' });
    }
}

function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}
