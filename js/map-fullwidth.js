// Ajuste estético: el mapa del Panel Principal ocupa todo el ancho de su tarjeta.
// No modifica datos, sensores, zonas ni lógica de Leaflet.
const styleId = 'sat-map-fullwidth-style';

if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #s-dash #real-map.real-map {
      width: 100% !important;
      max-width: none !important;
      height: 380px !important;
      max-height: none !important;
      min-height: 380px !important;
      display: block !important;
    }

    #s-dash #real-map .sat-leaflet-map,
    #s-dash #real-map .sat-upstream-map,
    #s-dash #real-map .leaflet-container {
      width: 100% !important;
      height: 100% !important;
      min-height: 380px !important;
      max-width: none !important;
    }

    @media (max-width: 700px) {
      #s-dash #real-map.real-map {
        height: 340px !important;
        min-height: 340px !important;
      }

      #s-dash #real-map .sat-leaflet-map,
      #s-dash #real-map .sat-upstream-map,
      #s-dash #real-map .leaflet-container {
        min-height: 340px !important;
      }
    }
  `;
  document.head.appendChild(style);
}
