# TravelTime - Frontend (React + Vite)

Este repositorio contiene la interfaz de usuario para la aplicación **TravelTime**, un sistema inteligente de predicción de tiempos de viaje para transporte privado en Trujillo, Perú.

Esta versión ha sido migrada a **React** con **Vite** para ofrecer una estructura más moderna, escalable y mantenible. Se ha eliminado por completo el control de acceso (login/registro) para agilizar la interacción del usuario y conectarse directamente con la API predictiva.

## 🚀 Características
*   **Diseño Reactivo**: Construido en componentes de React modernos.
*   **Mapa Interactivo (Leaflet)**: Integración nativa a través de hooks (`useEffect`/`useRef`) para posicionar origen y destino de manera visual.
*   **Enrutamiento Automático**: Consulta a la API de OSRM para trazar rutas sobre calles reales de Trujillo al marcar los puntos.
*   **Buscador Integrado**: Geocodificador Nominatim (OpenStreetMap) adaptado al mapa.
*   **Sincronización Inteligente**: Los marcadores arrastrados en el mapa sincronizan automáticamente las coordenadas del formulario y viceversa.
*   **Predicción IA**: Envío de datos al modelo LightGBM integrado para devolver estimaciones de viaje precisas.

## 🛠️ Tecnologías y Librerías Utilizadas
*   **Framework**: [React 19](https://react.dev/)
*   **Herramienta de Compilación**: [Vite](https://vite.dev/)
*   **Mapa**: [Leaflet](https://leafletjs.com/) (instalado mediante npm)
*   **Estilos**: CSS3 personalizado responsivo.

## 📂 Estructura del Repositorio
```
Frontend/
├── .github/
│   └── workflows/
│       └── static.yml         # GitHub Actions para compilar y desplegar a GitHub Pages desde /dist
├── public/                    # Recursos públicos y estáticos (ej. favicon)
├── src/
│   ├── assets/                # Assets gráficos del proyecto
│   ├── App.jsx                # Componente principal con el mapa Leaflet, buscador y formulario
│   ├── index.css              # Hoja de estilos principal de la interfaz
│   └── main.jsx               # Entrada del renderizado de React
├── index.html                 # Plantilla base de HTML
├── package.json               # Dependencias de npm y scripts de ejecución
├── vite.config.js             # Configuración de Vite
└── README.md                  # Este documento descriptivo
```

## 💻 Configuración Local

### Requisitos previos
*   Tener instalado **Node.js** (versión 18 o superior recomendada) y **npm**.

### 1. Instalar dependencias
Desde la raíz del repositorio, ejecuta:
```bash
npm install
```

### 2. Ejecutar en modo desarrollo
Levanta el servidor local con recarga automática:
```bash
npm run dev
```
Abre en tu navegador la dirección indicada en consola (normalmente `http://localhost:5173`).

### 3. Compilar para producción
Para empaquetar el proyecto optimizado para despliegue:
```bash
npm run build
```
Vite generará una carpeta `dist/` en la raíz, lista para ser servida por servidores web estáticos o plataformas de hosting como Vercel, Netlify, Render o GitHub Pages.

---

## 🔌 Integración con la API Backend
La interfaz consume la API de predicción que corre el modelo entrenado de Machine Learning. El endpoint por defecto está dirigido al servidor de producción:
`https://sistema-predictor-tiempo-transporte.onrender.com/predict`

Si requieres apuntar al backend local ejecutándose en el puerto 8000:
1.  Abre el archivo `src/App.jsx`.
2.  Busca la función `handleSubmitPrediction`.
3.  Modifica el URL del `fetch`:
    ```javascript
    const response = await fetch('http://localhost:8000/predict', { ... })
    ```
