export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
        return res.status(500).json({ error: "Configuración incompleta del servidor" });
    }

    try {
        const response = await fetch(
            `${url}/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,imagen,categoria,stock,activo&activo=eq.true&order=id.asc`,
            {
                headers: {
                    apikey: key,
                    Authorization: `Bearer ${key}`,
                    Accept: "application/json"
                }
            }
        );

        const data = await response.json().catch(() => []);

        if (!response.ok) {
            console.error("Supabase products error:", data);
            return res.status(502).json({ error: "No se pudieron cargar los productos" });
        }

        const safe = Array.isArray(data)
            ? data.map(p => ({
                id: p.id,
                nombre: String(p.nombre || ""),
                descripcion: String(p.descripcion || ""),
                caracteristicas: String(p.caracteristicas || ""),
                precio: Math.max(0, Number(p.precio) || 0),
                imagen: String(p.imagen || ""),
                categoria: String(p.categoria || ""),
                stock: Math.max(0, Number(p.stock) || 0),
                activo: Boolean(p.activo)
            }))
            : [];

        return res.status(200).json(safe);

    } catch (error) {
        console.error("Products API error:", error);
        return res.status(500).json({ error: "Error conectando con el catálogo" });
    }
}
