import { sendOrderConfirmationEmail } from "../lib/order-email.js";

async function supabaseFetch(path, options = {}) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const headers = {
        apikey: service,
        Authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
    };

    return fetch(`${url}${path}`, { ...options, headers });
}

function extractPaymentId(req) {
    const bodyId = req.body?.data?.id || req.body?.id;
    const queryId = req.query?.["data.id"] || req.query?.id;
    return String(bodyId || queryId || "").trim();
}

function publicOrigin(req) {
    const configured = String(process.env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
    if (/^https:\/\//i.test(configured)) return configured;

    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const host = String(req.headers.host || "fer-electro.vercel.app").trim();
    return `${proto === "http" ? "http" : "https"}://${host}`;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "GET") {
        return res.status(200).json({ ok: true });
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!token || !service || !process.env.SUPABASE_URL) {
        return res.status(500).json({ error: "Configuración incompleta" });
    }

    try {
        const topic = String(
    req.query?.topic ||
    req.query?.type ||
    req.body?.type ||
    req.body?.topic ||
    ""
).toLowerCase();

// Mercado Pago también puede enviar notificaciones de merchant_order.
// Ese ID NO es un payment_id, por lo que no debemos consultarlo
// mediante /v1/payments/:id.
if (topic === "merchant_order") {
    console.log("Webhook merchant_order ignorado correctamente");
    return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "merchant_order"
    });
}
        const paymentId = extractPaymentId(req);

        if (!paymentId) {
            return res.status(200).json({ ok: true, ignored: true });
        }

        // Nunca confiamos en el cuerpo del webhook: consultamos el pago directamente
        // a Mercado Pago con el token privado del comercio.
        const mpResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            }
        );

        const payment = await mpResponse.json().catch(() => ({}));

        if (!mpResponse.ok) {
            console.error("MP payment lookup failed:", payment);
            return res.status(502).json({ error: "No se pudo verificar el pago" });
        }

        const orderId = String(
            payment.external_reference ||
            payment.metadata?.pedido_id ||
            ""
        ).trim();

        if (!orderId) {
            return res.status(200).json({ ok: true, ignored: true });
        }

        const orderResponse = await supabaseFetch(
            `/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}&select=id,total,estado,cliente_nombre,cliente_email,tracking_token`
        );

        const orders = await orderResponse.json().catch(() => []);

        if (!orderResponse.ok || !Array.isArray(orders) || !orders[0]) {
            console.error("Order not found for payment:", orderId);
            return res.status(200).json({ ok: true, ignored: true });
        }

        const order = orders[0];
        const paidAmount = Number(payment.transaction_amount) || 0;
        const expectedAmount = Number(order.total) || 0;
        const status = String(payment.status || "").toLowerCase();

        if (status === "approved") {
            if (Math.abs(paidAmount - expectedAmount) > 0.01) {
                await supabaseFetch(`/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        estado: "pago_revisar_monto",
                        mp_payment_id: String(payment.id)
                    })
                });

                console.error("Payment amount mismatch", {
                    orderId,
                    expectedAmount,
                    paidAmount
                });

                return res.status(200).json({ ok: true, review: true });
            }

            const rpcResponse = await supabaseFetch(
                "/rest/v1/rpc/confirmar_pago_pedido",
                {
                    method: "POST",
                    body: JSON.stringify({
                        p_pedido_id: orderId,
                        p_payment_id: String(payment.id)
                    })
                }
            );

            const rpcData = await rpcResponse.json().catch(() => null);

            if (!rpcResponse.ok) {
                console.error("confirmar_pago_pedido failed:", rpcData);
                return res.status(500).json({ error: "No se pudo confirmar el pedido" });
            }

            // El email es un extra: nunca bloquea la confirmación del pago.
            // Si RESEND_API_KEY / EMAIL_FROM no están configurados, se omite.
            if (rpcData?.ok) {
                try {
                    const itemsResponse = await supabaseFetch(
                        `/rest/v1/pedido_items?pedido_id=eq.${encodeURIComponent(orderId)}&select=nombre,cantidad,precio_unitario&order=id.asc`
                    );
                    const items = await itemsResponse.json().catch(() => []);

                    if (itemsResponse.ok && Array.isArray(items)) {
                        await sendOrderConfirmationEmail({
                            order,
                            items,
                            origin: publicOrigin(req)
                        });
                    } else {
                        console.error("Order email items lookup failed:", orderId);
                    }
                } catch (emailError) {
                    console.error("Order confirmation email failed:", emailError?.message || emailError);
                }
            }

            return res.status(200).json({ ok: true, result: rpcData });
        }

        const estadoMap = {
            pending: "pago_pendiente",
            in_process: "pago_pendiente",
            rejected: "pago_rechazado",
            cancelled: "pago_cancelado",
            refunded: "reembolsado",
            charged_back: "contracargo"
        };

        const nuevoEstado = estadoMap[status] || "pendiente";

        await supabaseFetch(`/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}`, {
            method: "PATCH",
            body: JSON.stringify({
                estado: nuevoEstado,
                mp_payment_id: String(payment.id || "")
            })
        });

        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error("Webhook error:", error);
        return res.status(500).json({ error: "Webhook error" });
    }
}
