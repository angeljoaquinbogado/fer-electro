const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const id = String(req.query?.id || "").trim();

    if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: "Pedido inválido" });
    }

    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !service) {
        return res.status(500).json({ error: "Configuración incompleta" });
    }

    try {
        const response = await fetch(
            `${url}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&select=id,estado,created_at`,
            {
                headers: {
                    apikey: service,
                    Authorization: `Bearer ${service}`,
                    Accept: "application/json"
                }
            }
        );

        const rows = await response.json().catch(() => []);

        if (!response.ok || !Array.isArray(rows) || !rows[0]) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const estado = String(rows[0].estado || "pendiente");

        return res.status(200).json({
            id: rows[0].id,
            status: estado === "pagado" ? "pagado" :
                    estado.includes("pendiente") || estado === "pendiente" ? "pendiente" :
                    estado
        });

    } catch (error) {
        console.error("Order status error:", error);
        return res.status(500).json({ error: "No se pudo consultar el pedido" });
    }
}
