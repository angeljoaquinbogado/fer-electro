export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Método no permitido"
        });
    }

    try {
        const response = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/productos?select=id,nombre,descripcion,precio,imagen,categoria,stock,activo&activo=eq.true&order=id.asc`,
            {
                headers: {
                    apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({
            error: "Error conectando con Supabase"
        });
    }
}
