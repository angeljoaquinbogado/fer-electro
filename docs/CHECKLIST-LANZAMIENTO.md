# FER⚡ELECTRO — checklist de lanzamiento

## Ya resuelto en el código

- [x] Catálogo dinámico
- [x] Carrito y checkout
- [x] Mercado Pago en modo de prueba
- [x] Webhook y verificación del pago
- [x] Descuento atómico de stock
- [x] Seguridad RLS / admin
- [x] Protección anti-spam del checkout
- [x] Panel de productos
- [x] Panel de pedidos
- [x] Borrado múltiple de pedidos
- [x] Filtros y buscador de pedidos
- [x] Filtro por fechas y exportación CSV
- [x] Aviso de productos con stock crítico
- [x] Mis pedidos
- [x] Número profesional `FE-XXXXXXXXXX`
- [x] Link individual de seguimiento
- [x] Página privada de seguimiento
- [x] Versión móvil
- [x] SEO básico
- [x] Sitemap / robots / favicon / manifest
- [x] Página 404
- [x] Políticas operativas de compra y privacidad
- [x] Optimización WebP de imágenes locales
- [x] Código de email automático preparado

## Falta configurar sin necesidad del tío

- [ ] Activar un proveedor de email y cargar `RESEND_API_KEY` + `EMAIL_FROM` en Vercel
- [ ] Probar que llegue el email de confirmación a una dirección real
- [ ] Ejecutar una revisión visual final de escritorio y celular después del último deploy
- [ ] Probar una compra TEST completa después del último deploy

## Hacer con tu tío

- [ ] Entrar a la cuenta real de Mercado Pago que va a cobrar
- [ ] Obtener las credenciales de Producción
- [ ] Reemplazar la credencial TEST por Producción en Vercel
- [ ] Confirmar que los cobros lleguen a la cuenta correcta
- [ ] Hacer una compra real pequeña
- [ ] Verificar pedido, webhook y descuento de stock con ese pago real
- [ ] Definir el número comercial definitivo de WhatsApp
- [ ] Si quieren mensajes automáticos reales por WhatsApp: configurar WhatsApp Business / Meta

## Puede esperar después del lanzamiento

- [ ] Analytics avanzado
- [ ] Cupones
- [ ] Favoritos
- [ ] Reseñas
- [ ] Cuenta de cliente
- [ ] Automatizaciones de marketing
- [ ] Recuperación de carrito abandonado
