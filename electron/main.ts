// ---------- ventana maximizada y ajustada para pantallas de TV ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 1024, minHeight: 640,
    backgroundColor: '#07111f',
    title: 'Video Automation Studio',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: { 
      preload: path.join(__dirname, 'preload.js'), 
      contextIsolation: true, 
      nodeIntegration: false, 
      sandbox: false,
      zoomFactor: 0.80 // Forzamos el zoom al 80% desde las preferencias web nativas
    },
  });
  
  win.maximize();

  // Asegura que al cargar la página se aplique el factor de escala exacto
  win.webContents.on('did-finish-load', () => {
    win?.webContents.setZoomFactor(0.80);
  });

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}
