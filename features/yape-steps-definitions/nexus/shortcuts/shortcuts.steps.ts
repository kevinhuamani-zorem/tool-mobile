import { Then, DataTable } from '@wdio/cucumber-framework';
import ShortcutScreen from '../../../../screenobjects/nexus/shortcut.screen.ts';

const shortcutScreen = new ShortcutScreen();

Then(
    'el usuario visualiza los siguientes atajos de Yape Hijos:',
    async (dataTable: DataTable) => {
      const shortcuts = dataTable.raw().slice(1).flat();
      await shortcutScreen.validateShortcuts(shortcuts);
    }
  );