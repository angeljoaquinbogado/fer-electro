const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function parseJson(response,fallback){
    try{return await response.json();}catch{return fallback;}
}

export default async function handler(req,res){
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Content-Type-Options","nosniff");

    if(req.method!=="POST"){
        res.setHeader("Allow","POST");
        return res.status(405).json({error:"Método no permitido"});
    }

    const supabaseUrl=process.env.SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!supabaseUrl||!serviceKey){
        return res.status(500).json({error:"Configuración incompleta del servidor."});
    }

    const auth=String(req.headers.authorization||"").trim();
    if(!auth.startsWith("Bearer ")){
        return res.status(401).json({error:"Sesión requerida."});
    }

    const accessToken=auth.slice(7).trim();
    const ids=Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(v=>String(v||"").trim()))]
        : [];

    if(!ids.length||ids.length>200||ids.some(id=>!UUID_RE.test(id))){
        return res.status(400).json({error:"Lista de pedidos inválida."});
    }

    try{
        const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{
            headers:{
                apikey:serviceKey,
                Authorization:`Bearer ${accessToken}`,
                Accept:"application/json"
            }
        });
        const user=await parseJson(userResponse,{});
        if(!userResponse.ok||!user?.id){
            return res.status(401).json({error:"La sesión venció o no es válida."});
        }

        const adminResponse=await fetch(
            `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
            {
                headers:{
                    apikey:serviceKey,
                    Authorization:`Bearer ${serviceKey}`,
                    Accept:"application/json"
                }
            }
        );
        const admins=await parseJson(adminResponse,[]);
        if(!adminResponse.ok||!Array.isArray(admins)||!admins.length){
            return res.status(403).json({error:"No tenés permisos para eliminar pedidos."});
        }

        const inFilter=`in.(${ids.join(",")})`;

        const itemsResponse=await fetch(
            `${supabaseUrl}/rest/v1/pedido_items?pedido_id=${inFilter}`,
            {
                method:"DELETE",
                headers:{
                    apikey:serviceKey,
                    Authorization:`Bearer ${serviceKey}`,
                    Prefer:"return=minimal"
                }
            }
        );
        if(!itemsResponse.ok){
            const detail=await parseJson(itemsResponse,{});
            console.error("Delete pedido_items failed:",detail);
            return res.status(502).json({error:"No se pudieron eliminar los productos asociados a los pedidos."});
        }

        const ordersResponse=await fetch(
            `${supabaseUrl}/rest/v1/pedidos?id=${inFilter}`,
            {
                method:"DELETE",
                headers:{
                    apikey:serviceKey,
                    Authorization:`Bearer ${serviceKey}`,
                    Prefer:"return=representation",
                    Accept:"application/json"
                }
            }
        );
        const deleted=await parseJson(ordersResponse,[]);
        if(!ordersResponse.ok){
            console.error("Delete pedidos failed:",deleted);
            return res.status(502).json({error:"No se pudieron eliminar los pedidos."});
        }

        return res.status(200).json({
            ok:true,
            deleted:Array.isArray(deleted)?deleted.length:ids.length
        });
    }catch(error){
        console.error("Admin delete orders error:",error);
        return res.status(500).json({error:"No se pudieron eliminar los pedidos."});
    }
}
