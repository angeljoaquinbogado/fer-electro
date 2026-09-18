const SESSION_KEY = "ferAdminSession";
let CONFIG = null;
let session = null;
let productos = [];
let pedidos = [];
let selectedOrders = new Set();

const money = new Intl.NumberFormat("es-AR", {
    style:"currency",
    currency:"ARS",
    maximumFractionDigits:0
});

function orderCode(id){
    const raw=String(id||"").replaceAll("-","").toUpperCase();
    return raw ? `FE-${raw.slice(0,10)}` : "FE-—";
}

function orderPaymentGroup(status){
    const value=String(status||"").toLowerCase();
    if(value==="pagado")return "pagado";
    if(["pagado_revisar_stock","pago_revisar_monto"].includes(value))return "revision";
    if(["pendiente","pago_pendiente","error_pago"].includes(value))return "pendiente";
    if(["pago_rechazado","pago_cancelado","reembolsado","contracargo"].includes(value))return "fallido";
    return value||"pendiente";
}

function orderStatusLabel(status){
    const value=String(status||"pendiente").toLowerCase();
    const labels={
        pagado:"PAGADO",
        pagado_revisar_stock:"PAGADO · REVISAR STOCK",
        pago_revisar_monto:"PAGO · REVISAR MONTO",
        pendiente:"PENDIENTE",
        pago_pendiente:"PAGO PENDIENTE",
        error_pago:"ERROR AL INICIAR PAGO",
        pago_rechazado:"PAGO RECHAZADO",
        pago_cancelado:"PAGO CANCELADO",
        reembolsado:"REEMBOLSADO",
        contracargo:"CONTRACARGO"
    };
    return labels[value]||value.toUpperCase().replaceAll("_"," ");
}

function trackingLink(order){
    const id=String(order?.id||"").trim();
    const token=String(order?.tracking_token||"").trim();
    return id&&token
        ? `${location.origin}/pedido.html?id=${encodeURIComponent(id)}&tracking=${encodeURIComponent(token)}`
        : "";
}

function esc(value){
    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function msg(id, text="", type="error"){
    const el=document.getElementById(id);
    if(!el)return;
    el.textContent=text;
    el.className=`message ${text ? "show" : ""} ${type}`;
}

function icon(name){
    const icons={
        edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
        trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
        eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
        check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
        alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></svg>'
    };
    return icons[name]||'';
}

function showToast(text,type="ok"){
    const wrap=document.getElementById("admin-toast");
    if(!wrap)return;
    wrap.innerHTML=`<span class="toast-icon">${icon(type==="error"?"alert":"check")}</span><span>${esc(text)}</span>`;
    wrap.className=`admin-toast show ${type}`;
    clearTimeout(showToast._timer);
    showToast._timer=setTimeout(()=>wrap.classList.remove("show"),3200);
}

function confirmAction({title="Confirmar acción",text="¿Querés continuar?",confirmText="CONFIRMAR",danger=false}={}){
    return new Promise(resolve=>{
        const modal=document.getElementById("confirm-modal");
        const titleEl=document.getElementById("confirm-title");
        const textEl=document.getElementById("confirm-text");
        const yes=document.getElementById("confirm-yes");
        const no=document.getElementById("confirm-no");
        titleEl.textContent=title;
        textEl.textContent=text;
        yes.textContent=confirmText;
        yes.className=danger?"danger solid":"primary";
        modal.classList.add("active");
        modal.setAttribute("aria-hidden","false");
        const finish=value=>{
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden","true");
            yes.onclick=null;no.onclick=null;
            resolve(value);
        };
        yes.onclick=()=>finish(true);
        no.onclick=()=>finish(false);
        modal.onclick=e=>{if(e.target===modal)finish(false)};
    });
}

function resolveAdminImage(src){
    const value=String(src||"").trim();
    const legacy={
        "logo-2.PNG":"assets/images/brand/logo-fer-electro.webp",
        "/logo-2.PNG":"assets/images/brand/logo-fer-electro.webp",
        "logo.PNG":"assets/images/brand/logo-admin.webp",
        "/logo.PNG":"assets/images/brand/logo-admin.webp",
        "logo.jpg":"assets/images/brand/logo-legacy.jpg",
        "/logo.jpg":"assets/images/brand/logo-legacy.jpg",
        "auriculares 2.PNG":"assets/images/products/auriculares-2.webp",
        "/auriculares 2.PNG":"assets/images/products/auriculares-2.webp"
    };
    return legacy[value]||value||"assets/images/brand/logo-fer-electro.webp";
}

function setImagePreview(src){
    const wrap=document.getElementById("product-preview");
    const img=document.getElementById("product-preview-image");
    const empty=document.getElementById("product-preview-empty");
    if(!wrap||!img||!empty)return;
    const value=String(src||"").trim();
    if(!value){
        img.removeAttribute("src");
        img.classList.add("hidden");
        empty.classList.remove("hidden");
        return;
    }
    img.src=resolveAdminImage(value);
    img.classList.remove("hidden");
    empty.classList.add("hidden");
}

async function loadConfig(){
    if(CONFIG)return CONFIG;
    const r=await fetch("/api/public-config",{headers:{Accept:"application/json"}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||"No se pudo cargar la configuración.");
    CONFIG=d;
    return d;
}

function saveSession(data){
    session={
        access_token:data.access_token,
        refresh_token:data.refresh_token,
        user:data.user,
        expires_at:Date.now()+(Number(data.expires_in||3600)*1000)
    };
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
}

function readSession(){
    try{
        const value=JSON.parse(sessionStorage.getItem(SESSION_KEY));
        if(value?.access_token&&value?.refresh_token&&value?.user)return value;
    }catch{}
    return null;
}

async function refreshSessionIfNeeded(){
    if(!session)throw new Error("Sesión no iniciada.");
    if((session.expires_at||0)-Date.now()>60000)return session;

    const cfg=await loadConfig();
    const r=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
        method:"POST",
        headers:{
            apikey:cfg.supabasePublishableKey,
            "Content-Type":"application/json"
        },
        body:JSON.stringify({refresh_token:session.refresh_token})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error("La sesión venció. Volvé a ingresar.");
    saveSession(d);
    return session;
}

async function sb(path, options={}){
    await refreshSessionIfNeeded();
    const cfg=await loadConfig();
    const headers={
        apikey:cfg.supabasePublishableKey,
        Authorization:`Bearer ${session.access_token}`,
        Accept:"application/json",
        ...(options.headers||{})
    };
    if(options.body && !(options.body instanceof Blob) && !(options.body instanceof File)){
        headers["Content-Type"]="application/json";
    }
    const r=await fetch(`${cfg.supabaseUrl}${path}`,{...options,headers});
    if(r.status===401){
        logout();
        throw new Error("La sesión venció.");
    }
    return r;
}

async function verifyAdmin(){
    const r=await sb(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id`);
    const d=await r.json().catch(()=>[]);
    return r.ok&&Array.isArray(d)&&d.length>0;
}

async function login(email,password){
    const cfg=await loadConfig();
    const r=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`,{
        method:"POST",
        headers:{
            apikey:cfg.supabasePublishableKey,
            "Content-Type":"application/json"
        },
        body:JSON.stringify({email,password})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error("Email o contraseña incorrectos.");
    saveSession(d);

    if(!await verifyAdmin()){
        logout(false);
        throw new Error("Esta cuenta no está autorizada como administrador.");
    }
}

function logout(reload=true){
    session=null;
    sessionStorage.removeItem(SESSION_KEY);
    if(reload)location.reload();
}

function showApp(){
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("admin-app").classList.remove("hidden");
    document.getElementById("admin-email").textContent=session.user.email||"Administrador";
    const dot=document.getElementById("connection-state");
    if(dot)dot.textContent="CONECTADO";
}

async function loadProducts(){
    const tbody=document.getElementById("products-table");
    tbody.innerHTML='<tr><td colspan="6" class="loading">Cargando productos...</td></tr>';

    const r=await sb("/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,imagen,categoria,stock,activo&order=id.asc");
    const d=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error("No se pudieron cargar los productos.");
    productos=Array.isArray(d)?d:[];

    document.getElementById("stat-products").textContent=productos.length;
    document.getElementById("stat-stock").textContent=productos.reduce((s,p)=>s+Math.max(0,Number(p.stock)||0),0);
    document.getElementById("stat-active").textContent=productos.filter(p=>p.activo).length;

    const stockAlert=document.getElementById("product-stock-alert");
    if(stockAlert){
        const critical=productos.filter(p=>p.activo&&Math.max(0,Number(p.stock)||0)<=3).length;
        stockAlert.hidden=critical===0;
        stockAlert.textContent=critical===1?"1 PRODUCTO REQUIERE STOCK":`${critical} PRODUCTOS REQUIEREN STOCK`;
    }

    renderProducts();
}

function renderProducts(){
    const tbody=document.getElementById("products-table");
    const search=(document.getElementById("product-search")?.value||"").trim().toLowerCase();
    const filter=document.getElementById("product-filter")?.value||"all";
    const filtered=productos.filter(p=>{
        const haystack=`${p.nombre||""} ${p.categoria||""}`.toLowerCase();
        const matchesSearch=!search||haystack.includes(search);
        const stock=Math.max(0,Number(p.stock)||0);
        const matchesFilter=filter==="all" ||
            (filter==="active"&&p.activo) ||
            (filter==="hidden"&&!p.activo) ||
            (filter==="low"&&stock>0&&stock<=3) ||
            (filter==="out"&&stock===0);
        return matchesSearch&&matchesFilter;
    });

    const count=document.getElementById("product-list-count");
    if(count)count.textContent=`${filtered.length} de ${productos.length} productos`;
    tbody.innerHTML="";
    if(!filtered.length){
        tbody.innerHTML='<tr><td colspan="6" class="loading empty-state">No encontramos productos con esos filtros.</td></tr>';
        return;
    }

    filtered.forEach(p=>{
        const tr=document.createElement("tr");
        const stock=Math.max(0,Number(p.stock)||0);
        const stockClass=stock===0?"stock-out":stock<=3?"stock-low":"stock-ok";
        const stockText=stock===0?"SIN STOCK":stock<=3?`${stock} · BAJO`:`${stock}`;
        tr.innerHTML=`
            <td><div class="thumb-shell"><img class="product-thumb" src="${esc(resolveAdminImage(p.imagen))}" alt=""></div></td>
            <td><strong class="product-name-cell">${esc(p.nombre)}</strong><div class="cell-sub">${esc(p.categoria||"Sin categoría")}</div></td>
            <td><strong class="price-cell">${esc(money.format(Number(p.precio)||0))}</strong></td>
            <td><span class="stock-pill ${stockClass}">${stockText}</span></td>
            <td><span class="badge ${p.activo?"on":"off"}">${p.activo?"ACTIVO":"OCULTO"}</span></td>
            <td><div class="row-actions"><button class="icon-btn edit" type="button">${icon("edit")}<span>EDITAR</span></button><button class="icon-btn remove" type="button">${icon("trash")}<span>ELIMINAR</span></button></div></td>
        `;
        tr.querySelector(".edit").onclick=()=>editProduct(p.id);
        tr.querySelector(".remove").onclick=()=>deleteProduct(p.id,p.nombre);
        tbody.appendChild(tr);
    });
}

function resetProductForm(){
    document.getElementById("product-form").reset();
    document.getElementById("product-id").value="";
    document.getElementById("product-active").value="true";
    document.getElementById("product-form-title").textContent="Nuevo producto";
    document.getElementById("product-save").textContent="GUARDAR PRODUCTO";
    document.getElementById("product-cancel").classList.add("hidden");
    setImagePreview("");
    msg("product-message","");
}

function editProduct(id){
    const p=productos.find(x=>String(x.id)===String(id));
    if(!p)return;
    document.getElementById("product-id").value=p.id;
    document.getElementById("product-name").value=p.nombre||"";
    document.getElementById("product-description").value=p.descripcion||"";
    document.getElementById("product-features").value=p.caracteristicas||"";
    document.getElementById("product-price").value=Number(p.precio)||0;
    document.getElementById("product-stock").value=Number(p.stock)||0;
    document.getElementById("product-category").value=p.categoria||"";
    document.getElementById("product-image").value=p.imagen||"";
    document.getElementById("product-active").value=String(Boolean(p.activo));
    document.getElementById("product-form-title").textContent="Editar producto";
    document.getElementById("product-save").textContent="GUARDAR CAMBIOS";
    document.getElementById("product-cancel").classList.remove("hidden");
    setImagePreview(p.imagen||"");
    document.getElementById("product-form").scrollIntoView({behavior:"smooth",block:"start"});
}

async function uploadImage(file){
    if(!file)return "";
    if(file.size>5*1024*1024)throw new Error("La imagen supera 5 MB.");
    if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Usá JPG, PNG o WebP.");

    await refreshSessionIfNeeded();
    const cfg=await loadConfig();
    const cleanName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,"-").slice(-100);
    const path=`${Date.now()}-${crypto.randomUUID()}-${cleanName}`;

    const r=await fetch(`${cfg.supabaseUrl}/storage/v1/object/productos/${encodeURIComponent(path)}`,{
        method:"POST",
        headers:{
            apikey:cfg.supabasePublishableKey,
            Authorization:`Bearer ${session.access_token}`,
            "Content-Type":file.type,
            "x-upsert":"false"
        },
        body:file
    });
    if(!r.ok){
        const d=await r.json().catch(()=>({}));
        throw new Error(d.message||"No se pudo subir la imagen.");
    }
    return `${cfg.supabaseUrl}/storage/v1/object/public/productos/${encodeURIComponent(path)}`;
}

async function saveProduct(event){
    event.preventDefault();
    const button=document.getElementById("product-save");
    button.disabled=true;
    msg("product-message","");

    try{
        const id=document.getElementById("product-id").value.trim();
        const file=document.getElementById("product-image-file").files[0];
        let imagen=document.getElementById("product-image").value.trim();
        if(file)imagen=await uploadImage(file);

        const payload={
            nombre:document.getElementById("product-name").value.trim(),
            descripcion:document.getElementById("product-description").value.trim(),
            caracteristicas:document.getElementById("product-features").value.trim(),
            precio:Number(document.getElementById("product-price").value),
            stock:Math.max(0,Math.floor(Number(document.getElementById("product-stock").value)||0)),
            categoria:document.getElementById("product-category").value.trim(),
            imagen:imagen||"assets/images/brand/logo-fer-electro.webp",
            activo:document.getElementById("product-active").value==="true"
        };

        if(!payload.nombre||!Number.isFinite(payload.precio)||payload.precio<0){
            throw new Error("Revisá nombre y precio.");
        }

        const path=id?`/rest/v1/productos?id=eq.${encodeURIComponent(id)}`:"/rest/v1/productos";
        const r=await sb(path,{
            method:id?"PATCH":"POST",
            headers:{Prefer:"return=minimal"},
            body:JSON.stringify(payload)
        });

        if(!r.ok){
            const d=await r.json().catch(()=>({}));
            throw new Error(d.message||"No se pudo guardar el producto.");
        }

        msg("product-message",id?"Cambios guardados.":"Producto creado.","ok");
        showToast(id?"Cambios guardados correctamente.":"Producto creado correctamente.");
        await loadProducts();
        setTimeout(resetProductForm,700);
    }catch(e){
        msg("product-message",e.message||"Ocurrió un error.","error");
    }finally{
        button.disabled=false;
    }
}

async function deleteProduct(id,name){
    const ok=await confirmAction({
        title:"Eliminar producto",
        text:`Vas a eliminar “${name}”. Esta acción no se puede deshacer.`,
        confirmText:"ELIMINAR",
        danger:true
    });
    if(!ok)return;
    try{
        const r=await sb(`/rest/v1/productos?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});
        if(!r.ok)throw new Error("No se pudo eliminar. Si el producto tiene pedidos asociados, ocultalo en lugar de borrarlo.");
        await loadProducts();
        resetProductForm();
        showToast("Producto eliminado.");
    }catch(e){
        showToast(e.message||"No se pudo eliminar.","error");
    }
}


function updateOrderSelectionUI(){
    const checkboxes=Array.from(document.querySelectorAll(".order-checkbox"));
    const selectedVisible=checkboxes.filter(cb=>selectedOrders.has(cb.dataset.orderId)).length;
    const allVisible=checkboxes.length>0&&selectedVisible===checkboxes.length;

    const master=document.getElementById("orders-select-all");
    const masterHead=document.getElementById("orders-select-all-head");
    const count=document.getElementById("orders-selected-count");
    const deleteButton=document.getElementById("delete-selected-orders");

    if(master){master.checked=allVisible;master.indeterminate=selectedVisible>0&&!allVisible;}
    if(masterHead){masterHead.checked=allVisible;masterHead.indeterminate=selectedVisible>0&&!allVisible;}
    if(count)count.textContent=`${selectedOrders.size} ${selectedOrders.size===1?"seleccionado":"seleccionados"}`;
    if(deleteButton)deleteButton.disabled=selectedOrders.size===0;

    checkboxes.forEach(cb=>{
        const selected=selectedOrders.has(cb.dataset.orderId);
        cb.checked=selected;
        cb.closest("tr")?.classList.toggle("is-selected",selected);
    });
}

function setAllVisibleOrdersSelected(checked){
    document.querySelectorAll(".order-checkbox").forEach(cb=>{
        const id=String(cb.dataset.orderId||"");
        if(!id)return;
        if(checked)selectedOrders.add(id);
        else selectedOrders.delete(id);
    });
    updateOrderSelectionUI();
}

async function deleteSelectedOrders(){
    const ids=Array.from(selectedOrders);
    if(!ids.length)return;

    const ok=await confirmAction({
        title:ids.length===1?"Eliminar pedido":"Eliminar pedidos",
        text:ids.length===1
            ?"Vas a eliminar definitivamente este pedido y sus productos asociados. Esta acción no se puede deshacer."
            :`Vas a eliminar definitivamente ${ids.length} pedidos y sus productos asociados. Esta acción no se puede deshacer.`,
        confirmText:ids.length===1?"ELIMINAR PEDIDO":"ELIMINAR PEDIDOS",
        danger:true
    });
    if(!ok)return;

    const button=document.getElementById("delete-selected-orders");
    const original=button?.innerHTML||"";
    if(button){button.disabled=true;button.textContent="ELIMINANDO...";}

    try{
        await refreshSessionIfNeeded();
        const r=await fetch("/api/admin-delete-orders",{
            method:"POST",
            headers:{
                Authorization:`Bearer ${session.access_token}`,
                "Content-Type":"application/json",
                Accept:"application/json"
            },
            body:JSON.stringify({ids})
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.error||"No se pudieron eliminar los pedidos.");

        selectedOrders.clear();
        await loadOrders();
        showToast(`${Number(d.deleted)||ids.length} ${ids.length===1?"pedido eliminado":"pedidos eliminados"}.`);
    }catch(e){
        showToast(e.message||"No se pudieron eliminar los pedidos.","error");
        updateOrderSelectionUI();
    }finally{
        if(button){
            button.innerHTML=original;
            updateOrderSelectionUI();
        }
    }
}

function orderBadgeClass(status){
    if(status==="pagado")return "pagado";
    if(["pendiente","pago_pendiente"].includes(status))return "pendiente";
    if(["pago_rechazado","pago_cancelado"].includes(status))return status;
    if(status.includes("revisar"))return "review";
    return "";
}

function filteredOrders(){
    const search=String(document.getElementById("order-search")?.value||"").trim().toLowerCase();
    const payment=String(document.getElementById("order-payment-filter")?.value||"all");
    const prep=String(document.getElementById("order-prep-filter")?.value||"all");
    const dateFrom=String(document.getElementById("order-date-from")?.value||"");
    const dateTo=String(document.getElementById("order-date-to")?.value||"");
    const fromTs=dateFrom?new Date(`${dateFrom}T00:00:00`).getTime():null;
    const toTs=dateTo?new Date(`${dateTo}T23:59:59.999`).getTime():null;

    return pedidos.filter(order=>{
        const haystack=[
            orderCode(order.id),
            order.id,
            order.cliente_nombre,
            order.cliente_email,
            order.cliente_telefono,
            order.ciudad,
            order.provincia
        ].map(v=>String(v||"").toLowerCase()).join(" ");

        const createdTs=new Date(order.created_at).getTime();
        const matchesSearch=!search||haystack.includes(search);
        const matchesPayment=payment==="all"||orderPaymentGroup(order.estado)===payment;
        const matchesPrep=prep==="all"||String(order.preparacion_estado||"nuevo")===prep;
        const matchesFrom=fromTs===null||(!Number.isNaN(createdTs)&&createdTs>=fromTs);
        const matchesTo=toTs===null||(!Number.isNaN(createdTs)&&createdTs<=toTs);
        return matchesSearch&&matchesPayment&&matchesPrep&&matchesFrom&&matchesTo;
    });
}

function csvCell(value){
    let text=String(value??"").replaceAll('"','""');
    // Evita que Excel interprete contenido de clientes como una fórmula.
    if(/^[=+\-@]/.test(text))text=`'${text}`;
    return `"${text}"`;
}

function exportFilteredOrders(){
    const rows=filteredOrders();
    if(!rows.length){
        showToast("No hay pedidos para exportar con estos filtros.","error");
        return;
    }

    const header=["Pedido","Fecha","Cliente","Email","Teléfono","Total ARS","Pago","Preparación","Ciudad","Provincia"];
    const lines=[header.map(csvCell).join(",")];

    rows.forEach(order=>{
        lines.push([
            orderCode(order.id),
            new Date(order.created_at).toLocaleString("es-AR"),
            order.cliente_nombre,
            order.cliente_email,
            order.cliente_telefono,
            Number(order.total)||0,
            orderStatusLabel(order.estado),
            String(order.preparacion_estado||"nuevo").toUpperCase(),
            order.ciudad,
            order.provincia
        ].map(csvCell).join(","));
    });

    const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`fer-electro-pedidos-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`${rows.length} ${rows.length===1?"pedido exportado":"pedidos exportados"}.`);
}

function renderOrders(){
    const tbody=document.getElementById("orders-table");
    if(!tbody)return;

    const visible=filteredOrders();
    const visibleIds=new Set(visible.map(o=>String(o.id)));

    // Nunca dejamos pedidos seleccionados pero ocultos por un filtro.
    for(const id of [...selectedOrders]){
        if(!visibleIds.has(id))selectedOrders.delete(id);
    }

    const count=document.getElementById("orders-list-count");
    if(count)count.textContent=`${visible.length} de ${pedidos.length} pedidos`;

    tbody.innerHTML="";
    if(!visible.length){
        tbody.innerHTML='<tr><td colspan="8" class="loading">No encontramos pedidos con esos filtros.</td></tr>';
        updateOrderSelectionUI();
        return;
    }

    visible.forEach(o=>{
        const tr=document.createElement("tr");
        const date=new Date(o.created_at);
        const code=orderCode(o.id);
        tr.innerHTML=`
            <td class="order-check-cell"><input class="order-checkbox" type="checkbox" data-order-id="${esc(o.id)}" aria-label="Seleccionar pedido ${esc(code)}"></td>
            <td>${esc(date.toLocaleString("es-AR"))}</td>
            <td><strong>${esc(o.cliente_nombre)}</strong><div class="cell-sub">${esc(code)}</div></td>
            <td>${esc(o.cliente_email)}<div class="cell-sub">${esc(o.cliente_telefono)}</div></td>
            <td><strong>${esc(money.format(Number(o.total)||0))}</strong></td>
            <td><span class="badge ${orderBadgeClass(String(o.estado||""))}">${esc(orderStatusLabel(o.estado))}</span></td>
            <td>
                <select class="fulfillment-select" aria-label="Estado de preparación de ${esc(code)}">
                    <option value="nuevo" ${o.preparacion_estado==="nuevo"?"selected":""}>NUEVO</option>
                    <option value="preparando" ${o.preparacion_estado==="preparando"?"selected":""}>PREPARANDO</option>
                    <option value="enviado" ${o.preparacion_estado==="enviado"?"selected":""}>ENVIADO</option>
                    <option value="entregado" ${o.preparacion_estado==="entregado"?"selected":""}>ENTREGADO</option>
                    <option value="cancelado" ${o.preparacion_estado==="cancelado"?"selected":""}>CANCELADO</option>
                </select>
            </td>
            <td><button class="icon-btn order-view" type="button">${icon("eye")}<span>VER PEDIDO</span></button></td>
        `;
        const checkbox=tr.querySelector(".order-checkbox");
        checkbox?.addEventListener("change",()=>{
            const id=String(o.id);
            if(checkbox.checked)selectedOrders.add(id);
            else selectedOrders.delete(id);
            updateOrderSelectionUI();
        });
        tr.querySelector(".fulfillment-select")?.addEventListener("change",e=>updateFulfillment(o.id,e.target.value));
        tr.querySelector(".order-view")?.addEventListener("click",()=>openOrder(o));
        tbody.appendChild(tr);
    });

    updateOrderSelectionUI();
}

async function loadOrders(){
    const tbody=document.getElementById("orders-table");
    selectedOrders.clear();
    tbody.innerHTML='<tr><td colspan="8" class="loading">Cargando pedidos...</td></tr>';
    updateOrderSelectionUI();

    const r=await sb("/rest/v1/pedidos?select=id,created_at,cliente_nombre,cliente_email,cliente_telefono,domicilio,ciudad,provincia,codigo_postal,metodo_entrega,notas,total,estado,preparacion_estado,tracking_token&order=created_at.desc&limit=300");
    const d=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error("No se pudieron cargar los pedidos.");

    pedidos=Array.isArray(d)?d:[];

    const totalEl=document.getElementById("order-stat-total");
    const paidEl=document.getElementById("order-stat-paid");
    const pendingEl=document.getElementById("order-stat-pending");
    if(totalEl)totalEl.textContent=pedidos.length;
    if(paidEl)paidEl.textContent=pedidos.filter(o=>orderPaymentGroup(o.estado)==="pagado").length;
    if(pendingEl)pendingEl.textContent=pedidos.filter(o=>orderPaymentGroup(o.estado)==="pendiente").length;

    renderOrders();
}


async function updateFulfillment(id,value){
    const allowed=["nuevo","preparando","enviado","entregado","cancelado"];
    if(!allowed.includes(value))return;
    try{
        const r=await sb(`/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`,{
            method:"PATCH",
            headers:{Prefer:"return=minimal"},
            body:JSON.stringify({preparacion_estado:value})
        });
        if(!r.ok)throw new Error("No se pudo actualizar el estado de preparación.");
        const local=pedidos.find(o=>String(o.id)===String(id));
        if(local)local.preparacion_estado=value;
        renderOrders();
        showToast("Estado del pedido actualizado.");
    }catch(e){
        showToast(e.message||"No se pudo actualizar el pedido.","error");
        await loadOrders();
    }
}

async function openOrder(order){
    const modal=document.getElementById("order-modal");
    const content=document.getElementById("order-modal-content");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden","false");
    content.className="loading";
    content.textContent="Cargando detalle...";

    try{
        const r=await sb(`/rest/v1/pedido_items?pedido_id=eq.${encodeURIComponent(order.id)}&select=nombre,cantidad,precio_unitario&order=id.asc`);
        const items=await r.json().catch(()=>[]);
        if(!r.ok)throw new Error("No se pudo cargar el detalle.");

        const code=orderCode(order.id);
        const link=trackingLink(order);
        const phone=String(order.cliente_telefono||"").replace(/\D/g,"");
        const waPhone=phone.startsWith("54")?phone:`54${phone}`;
        const waHref=phone
            ? `https://wa.me/${encodeURIComponent(waPhone)}?text=${encodeURIComponent(`Hola, te contactamos de FER ELECTRO por tu pedido ${code}.`)}`
            : "";

        content.className="";
        content.innerHTML=`
            <div class="order-modal-code">
                <span>NÚMERO DE PEDIDO</span>
                <strong>${esc(code)}</strong>
                <small>${esc(new Date(order.created_at).toLocaleString("es-AR"))}</small>
            </div>
            <div class="order-meta">
                <div><span>CLIENTE</span><strong>${esc(order.cliente_nombre)}</strong></div>
                <div><span>CONTACTO</span><strong>${esc(order.cliente_email)} · ${esc(order.cliente_telefono)}</strong></div>
                <div><span>ENTREGA</span><strong>${esc(order.domicilio)}, ${esc(order.ciudad)}, ${esc(order.provincia)} · CP ${esc(order.codigo_postal)}</strong></div>
                <div><span>TOTAL</span><strong>${esc(money.format(Number(order.total)||0))}</strong></div>
                <div><span>PAGO</span><strong>${esc(orderStatusLabel(order.estado))}</strong></div>
                <div><span>PREPARACIÓN</span><strong>${esc(String(order.preparacion_estado||"nuevo").toUpperCase())}</strong></div>
            </div>
            ${order.notas?`<div class="order-note"><strong>Aclaraciones:</strong> ${esc(order.notas)}</div>`:""}
            <div class="order-modal-actions">
                ${link?`<button class="secondary copy-tracking-link" type="button">COPIAR LINK DE SEGUIMIENTO</button>`:""}
                ${waHref?`<a class="primary" href="${esc(waHref)}" target="_blank" rel="noopener">ESCRIBIR AL CLIENTE</a>`:""}
            </div>
            <h3 class="order-products-title">Productos</h3>
            <div class="order-items">
                ${(Array.isArray(items)?items:[]).map(i=>`
                    <div class="order-item-row">
                        <div>
                            <strong>${esc(i.nombre)}</strong>
                            <small>${Math.max(1,Number(i.cantidad)||1)} × ${esc(money.format(Number(i.precio_unitario)||0))}</small>
                        </div>
                        <strong>${esc(money.format((Number(i.precio_unitario)||0)*(Number(i.cantidad)||0)))}</strong>
                    </div>
                `).join("") || '<div class="loading">Sin ítems.</div>'}
            </div>
        `;

        content.querySelector(".copy-tracking-link")?.addEventListener("click",async e=>{
            const button=e.currentTarget;
            const original=button.textContent;
            try{
                await navigator.clipboard.writeText(link);
                button.textContent="LINK COPIADO";
            }catch{
                button.textContent="NO SE PUDO COPIAR";
            }
            setTimeout(()=>button.textContent=original,1800);
        });
    }catch(e){
        content.className="message show error";
        content.textContent=e.message;
    }
}

function closeOrder(){
    const modal=document.getElementById("order-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden","true");
}

async function refreshAll(){
    const current=document.querySelector(".tab.active")?.dataset.tab;
    try{
        if(current==="orders")await loadOrders();
        else await loadProducts();
    }catch(e){
        showToast(e.message||"No se pudo actualizar.","error");
    }
}

document.getElementById("login-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const button=document.getElementById("login-button");
    button.disabled=true;
    msg("login-message","");
    try{
        await login(
            document.getElementById("login-email").value.trim(),
            document.getElementById("login-password").value
        );
        showApp();
        await loadProducts();
    }catch(err){
        msg("login-message",err.message||"No se pudo iniciar sesión.");
    }finally{
        button.disabled=false;
    }
});

document.getElementById("product-form").addEventListener("submit",saveProduct);
document.getElementById("product-cancel").addEventListener("click",resetProductForm);
document.getElementById("logout-button").addEventListener("click",()=>logout());
document.getElementById("refresh-button").addEventListener("click",refreshAll);

document.querySelectorAll(".tab").forEach(button=>{
    button.addEventListener("click",async()=>{
        document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===button));
        document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
        document.getElementById(`${button.dataset.tab}-panel`).classList.add("active");
        if(button.dataset.tab==="orders"){
            try{await loadOrders();}catch(e){showToast(e.message||"No se pudieron cargar los pedidos.","error");}
        }
    });
});


document.getElementById("orders-select-all")?.addEventListener("change",e=>setAllVisibleOrdersSelected(e.target.checked));
document.getElementById("orders-select-all-head")?.addEventListener("change",e=>setAllVisibleOrdersSelected(e.target.checked));
document.getElementById("delete-selected-orders")?.addEventListener("click",deleteSelectedOrders);

document.getElementById("product-search")?.addEventListener("input",renderProducts);
document.getElementById("product-filter")?.addEventListener("change",renderProducts);

const rerenderOrderFilters=()=>{
    selectedOrders.clear();
    renderOrders();
};
document.getElementById("order-search")?.addEventListener("input",rerenderOrderFilters);
document.getElementById("order-payment-filter")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("order-prep-filter")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("order-date-from")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("order-date-to")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("export-orders")?.addEventListener("click",exportFilteredOrders);
document.getElementById("new-product-button")?.addEventListener("click",()=>{
    const productsTab=document.querySelector('.tab[data-tab="products"]');
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===productsTab));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    document.getElementById("products-panel").classList.add("active");
    resetProductForm();
    document.getElementById("product-form").scrollIntoView({behavior:"smooth",block:"start"});
    setTimeout(()=>document.getElementById("product-name")?.focus(),450);
});
document.getElementById("product-image")?.addEventListener("input",e=>setImagePreview(e.target.value));
document.getElementById("product-image-file")?.addEventListener("change",e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const url=URL.createObjectURL(file);
    setImagePreview(url);
    const img=document.getElementById("product-preview-image");
    if(img)img.onload=()=>URL.revokeObjectURL(url);
});

document.getElementById("order-modal-close").addEventListener("click",closeOrder);
document.getElementById("order-modal").addEventListener("click",e=>{
    if(e.target.id==="order-modal")closeOrder();
});
document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&document.getElementById("order-modal").classList.contains("active"))closeOrder();
});

(async function boot(){
    try{
        await loadConfig();
        session=readSession();
        if(!session)return;
        if(!await verifyAdmin()){
            logout(false);
            return;
        }
        showApp();
        await loadProducts();
    }catch(e){
        console.error(e);
        logout(false);
    }
})();
