import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import { TypeLocator } from '../../support/utils/Enums.ts';
import MenuLocator from '../../resources/locators/nexus/menu.locator.json' with { type: 'json' };
import HomeLocator from '../../resources/locators/nexus/home.locator.json' with { type: 'json' };

type Point = { x: number; y: number };
type Rect = { width: number; height: number };

class MisDireccionesScreen extends BaseScreen {

public async getHamburgerMenu() {
  if (driver.isAndroid) {
    const oldMenu = $(`android=new UiSelector().description("Opciones de cuenta")`);
    if (await oldMenu.isExisting()) return oldMenu;

    const newMenu = $(`android=new UiSelector().description("Mi perfil")`);
    if (await newMenu.isExisting()) return newMenu;

    throw new Error('Not found(Options of count or my perfil)');
  }

  return $(
    LocatorFactory.getElement(
      TypeLocator.XPATH,
      HomeLocator.homeIos.btnMenuHamburguesa,
      TypeLocator.XPATH,     
      ''                         
    )
  );
}

public async openHamburgerMenu() {
  const menu = await this.getHamburgerMenu();
  await menu.waitForDisplayed({ timeout: 15000 });
  await menu.click();
}


  
  async selectMenuOptionMisDirecciones() {
    const locator = LocatorFactory.getElement(
      TypeLocator.XPATH,
      MenuLocator.menuIos.txtMenuMisDirecciones,
      TypeLocator.ANDROID,
      MenuLocator.menuAndroid.txtMenuMisDirecciones
    );
    const element = $(locator);
    await element.waitForDisplayed({ timeout: 10000 });
    await element.click();
  }

  async waitForScreen(timeout = 8000) {
    const start = Date.now();
    let graceGiven = false;

    const vpnBlockedXpaths = [
      '//android.widget.TextView[@text="Access denied"]',
      '//android.widget.TextView[@text="Error 16"]',
      '//android.widget.TextView[@text="What happened?"]',
      '//android.widget.TextView[@text="This request was blocked by our security service"]'
    ];

    while (Date.now() - start < timeout) {

      // Detect possible VPN blocks
      for (const xp of vpnBlockedXpaths) {
        const els = await driver.$$(xp);
        const count = await els.length;

        if (count > 0) {
          throw new Error(
            'Bloqueo VPN (Access denied / Error 16)'
          );
        }
      }

      //Wait for mis direcciones
      if (!graceGiven) {
        await driver.pause(6000);
        graceGiven = true;
      }
      const title = await driver.$(
        '//android.webkit.WebView[contains(@text,"Mis Direcciones")]'
      );

      if (await title.isExisting()) {
        return;
      }

      await driver.pause(250);
    
    }
    throw new Error('Timeout: no cargó la pantalla Mis direcciones');
  }

  async validateNameDireccion(timeoutMs = 15000) {
  const start = Date.now();

  const { width, height } = await driver.getWindowRect();
  this.log(`WindowRect w=${width} h=${height}`);
    const praderaPoint = {
      x: Math.round(width * 0.25),
      y: Math.round(height * 0.30), 
    };

    const copiarPoint = {
      x: Math.round(width * 0.30),
      y: Math.round(praderaPoint.y - (height * 0.07)), 
    };
    const dismissPoint = {
      x: Math.round(width * 0.90),
      y: Math.round(height * 0.90),
    };

  while (Date.now() - start < timeoutMs) {
    await this.clearClipboard();
    this.log(
      `LongPress Pradera x=${praderaPoint.x} y=${praderaPoint.y}`
    );
    await this.longPress(praderaPoint, 650);
    await this.sleep(400);

    this.log(
      `Tap Copiar x=${copiarPoint.x} y=${copiarPoint.y}`
    );
    await this.tap(copiarPoint);
    await this.sleep(300);

    const clip = (await this.getClipboardText()).trim();
    this.log(`Clipboard="${clip}"`);

    await this.tap(dismissPoint);
    await this.sleep(200);

    if (clip.toLowerCase().includes('pradera')) {
      this.log(`PASS: Dirección encontrada -> "${clip}"`);
      return;
    }

    this.log(`No match aún, reintentando...`);
    await this.sleep(400);
  }

  throw new Error(
    '[MisDirecciones] FAIL: No se pudo localizar la dirección por coordenadas'
  );
  }

  async tapNuevaDireccion() {
  const { width, height } = await driver.getWindowRect();

  const nuevaDireccionPoint = {
    x: Math.round(width * 0.25),
    y: Math.round(height * 0.22),
  };

  this.log(
    `Tap Nueva Dirección x=${nuevaDireccionPoint.x} y=${nuevaDireccionPoint.y}`
  );

  await this.tap(nuevaDireccionPoint);
  await this.sleep(400);
  }

  async tapUsarUbicacionActual() {
    const { width, height } = await driver.getWindowRect();

    const base: Point = {
      x: Math.round(width * 0.48),
      y: Math.round(height * 0.24),
    };
    // Time for map to load and stabilize
    await this.sleep(5000);

    this.log(`Tap Usar ubicación actual x=${base.x} y=${base.y}`);

    const tries: Point[] = [
      base,
      { x: base.x + 12, y: base.y },
      { x: base.x - 12, y: base.y },
    ];

    for (const p of tries) {
      await this.tap(p);
      await this.sleep(350);
    }
  }

  async tapContinuarUbicacion() {
    const { width, height } = await driver.getWindowRect();

    const base: Point = {
      x: Math.round(width * 0.50),
      y: Math.round(height * 0.90),
    };

    // Wait for map to load
    await this.sleep(3500);

    this.log(`Tap CONTINUAR intento 1 x=${base.x} y=${base.y}`);
    await this.tap(base);
    await this.sleep(800);

    this.log(`Tap CONTINUAR intento 2 x=${base.x} y=${base.y}`);
    await this.tap(base);
    await this.sleep(800);
  }

  async fillNroMzEtapa(value = '5577775') {
    const { width, height } = await driver.getWindowRect();

    const nroMzEtapaPoint = {
      x: Math.round(width * 0.28),
      y: Math.round(height * 0.47),
    };

    this.log(`Tap Nro/Mz/Etapa x=${nroMzEtapaPoint.x} y=${nroMzEtapaPoint.y}`);
    await this.tap(nroMzEtapaPoint);
    await this.sleep(400);
    await driver.keys(value.split(''));
    await this.sleep(300);
  }

  async tapGuardarDireccion() {
    const { width, height } = await driver.getWindowRect();

    const guardarPoint = {
      x: Math.round(width * 0.50),
      y: Math.round(height * 0.87),
    };

    this.log(`Tap GUARDAR DIRECCIÓN x=${guardarPoint.x} y=${guardarPoint.y}`);
    await this.hideKeyboardIfShown();
    await this.sleep(400);
    const tries = [
      guardarPoint,
      { x: guardarPoint.x, y: guardarPoint.y - 14 },
      { x: guardarPoint.x + 14, y: guardarPoint.y },
    ];

    for (const p of tries) {
      await this.tap(p);
      await this.sleep(450);
    }
  }

  async tapOverflowNuevaDireccion() {
    const { width, height } = await driver.getWindowRect();

    const p: Point = {
      x: Math.round(width * 0.94),
      y: Math.round(height * 0.41) - 48,
    };

    this.log(`Tap overflow ⋮ x=${p.x} y=${p.y}`);
    await this.sleep(700);
    await this.tap(p);
    await this.sleep(500);
  }

  async tapEliminarEnMenuOverflow() {
    const { width, height } = await driver.getWindowRect();

    const overflowPoint: Point = {
      x: Math.round(width * 0.94),
      y: Math.round(height * 0.41) - 48,
    };

    const eliminarPoint: Point = {
      x: overflowPoint.x,
      y: overflowPoint.y + 60, 
    };

    this.log(
      `Tap Eliminar relativo al overflow x=${eliminarPoint.x} y=${eliminarPoint.y}`
    );

    await this.sleep(300);

    await this.tap(eliminarPoint);
    await this.sleep(500);
  }

  async confirmarEliminarDireccion() {
    const { width, height } = await driver.getWindowRect();

    const confirmarPoint: Point = {
      x: Math.round(width * 0.50),
      y: Math.round(height * 0.58),
    };

    this.log(`Tap confirmar eliminar x=${confirmarPoint.x} y=${confirmarPoint.y}`);

    await this.sleep(400);
    await this.tap(confirmarPoint);
    await this.sleep(800);
  }

  async setBuscarDireccion() {
  const { width, height } = await driver.getWindowRect();

  const focus1: Point = { x: Math.round(width * 0.45), y: Math.round(height * 0.14) };
  const focus2: Point = { x: Math.round(width * 0.60), y: Math.round(height * 0.14) };

  await this.tap(focus1);
  await this.sleep(300);

  await this.tap(focus2);
  await this.sleep(450);

  await this.clearTypingBuffer(35);
  await this.sleep(200);

  await driver.keys(['P','l','a','z','a',' ','V','e','a']);
  await this.sleep(300);
  }

  async selectFirstSearchResult() {
    const { width, height } = await driver.getWindowRect();

    const firstResultPoint: Point = {
      x: Math.round(width * 0.52),
      y: Math.round(height * 0.27),
    };
    await this.sleep(1200);

    this.log(`Tap 1er resultado x=${firstResultPoint.x} y=${firstResultPoint.y}`);
    await this.tap(firstResultPoint);
    await this.sleep(700);
  }

  async tapOverflowFirstCard() {
    const { width, height } = await driver.getWindowRect();

    const p: Point = {
      x: Math.round(width * 0.92),
      y: Math.round(height * 0.30),
    };

    this.log(`Tap overflow Casa ⋮ FINAL x=${p.x} y=${p.y}`);
    await this.sleep(400);
    await this.tap(p);
    await this.sleep(500);
  }

  async tapEliminarFirstCard() {
    const { width, height } = await driver.getWindowRect();

    const overflowPoint: Point = {
      x: Math.round(width * 0.92),
      y: Math.round(height * 0.30),
    };

    const eliminarPoint: Point = {
      x: overflowPoint.x,
      y: overflowPoint.y + 60,
    };

    this.log(
      `[MisDirecciones] Tap Eliminar relativo al overflow x=${eliminarPoint.x} y=${eliminarPoint.y}`
    );

    await this.sleep(300);
    await this.tap(eliminarPoint);
    await this.sleep(500);
  }

  async tapEditarFirstCard() {
    const { width, height } = await driver.getWindowRect();

    const overflowPoint: Point = {
      x: Math.round(width * 0.92),
      y: Math.round(height * 0.30),
    };

    const editarPoint: Point = {
      x: overflowPoint.x - Math.round(width * 0.18), 
      y: overflowPoint.y + 150,                     
    };

    this.log(`Tap Editar x=${editarPoint.x} y=${editarPoint.y}`);

    await this.sleep(250);
    await this.tap(editarPoint);
    await this.sleep(800);
  }

  async editarDptoDesdeNroMz() {
  const { width, height } = await driver.getWindowRect();

  const nroMzEtapaPoint: Point = {
    x: Math.round(width * 0.28),
    y: Math.round(height * 0.47),
  };

  const dptoPoint: Point = {
    x: Math.round(width * 0.72), 
    y: nroMzEtapaPoint.y,
  };

  const nuevoNumero = Math.floor(100 + Math.random() * 900).toString();

  this.log(`Tap Dpto/Int/Lt x=${dptoPoint.x} y=${dptoPoint.y}`);
  await this.tap(dptoPoint);
  await this.sleep(400);

  await this.clearTypingBuffer(10);

  await driver.keys(nuevoNumero.split(''));
  await this.sleep(300);

  this.log(`Dpto actualizado a: ${nuevoNumero}`);
  }

  async tapConfirmarActualizarDireccion() {
  const { width, height } = await driver.getWindowRect();

  const confirmarPoint: Point = {
    x: Math.round(width * 0.50),
    y: Math.round(height * 0.56),
  };

  this.log(`Tap Confirmar Actualizar x=${confirmarPoint.x} y=${confirmarPoint.y}`);
  await this.sleep(300);
  await this.tap(confirmarPoint);
  await this.sleep(900);
  }

  async validarSnackbarDireccionOK() {
    await this.clearClipboard();
    await this.sleep(50);

    const { width, height } = await driver.getWindowRect();

    const p: Point = {
      x: Math.round(width * 0.22),  
      y: Math.round(height * 0.885), 
    };

    this.log(`[SNACKBAR] LongPress para copiar "dirección" x=${p.x} y=${p.y}`);
    await this.longPress(p, 550);
    await this.sleep(120);

    const copiarPoint: Point = {
      x: Math.round(width * 0.19),
      y: Math.round(height * 0.80) 
    };

    this.log(`[SNACKBAR] Tap Copiar x=${copiarPoint.x} y=${copiarPoint.y}`);
    await this.tap(copiarPoint);
    await this.sleep(150);

    const text = await this.getClipboardText();
    this.log(`[SNACKBAR] Clipboard="${text}"`);

    if (!text || !text.toLowerCase().includes('dirección')) {
      throw new Error(
        `[SNACKBAR] FAIL: No se encontró la palabra "dirección" en el clipboard. Obtenido="${text}"`
      );
    }
    this.log(`[SNACKBAR] PASS: Se encontró "dirección"`);
  }


// -------------------------
// Helpers
// -------------------------
  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private log(msg: string) {
    console.log(`[MisDirecciones] ${msg}`);
  }

  private async tap(p: Point) {
    await driver.execute('mobile: clickGesture', { x: p.x, y: p.y });
  }

  private async longPress(p: Point, duration: number) {
    await driver.execute('mobile: longClickGesture', { x: p.x, y: p.y, duration });
  }

  private async clearClipboard() {
    await driver.execute('mobile: setClipboard', {
      content: '',
      contentType: 'plaintext',
      label: 'clear',
    });
  }

  private decodeClipboard(raw: string): string {
    if (!raw) return '';
    const s = String(raw).trim();

    //Base64 heuristic(Appium sometimes returns base64)
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(s) && s.length % 4 === 0;
    if (!looksBase64) return s;

    try {
      const decoded = Buffer.from(s, 'base64').toString('utf-8').trim();
      return decoded.length ? decoded : s;
    } catch {
      return s;
    }
  }

  private async getClipboardText(): Promise<string> {
    const raw = await driver.execute('mobile: getClipboard', { contentType: 'plaintext' });
    return this.decodeClipboard(String(raw ?? ''));
  }

  private async hideKeyboardIfShown() {
  try {
    this.log('Ocultando teclado...');
    await driver.hideKeyboard();
    await this.sleep(400);
  } catch (e) {
    this.log('Teclado no visible, continuando');
  }
  }

  private async clearTypingBuffer(maxDeletes = 40) {
    this.log(`Clearing input with backspace x${maxDeletes}`);
    for (let i = 0; i < maxDeletes; i++) {
      await driver.keys(['Backspace']);
      await this.sleep(20);
    }
  }


}
export default new MisDireccionesScreen();