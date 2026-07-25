import {  Then } from '@wdio/cucumber-framework';
import searchScreen from 'screenobjects/nexus/search-functionality.screen.ts';

Then(/^se valida el orden de funcionalidades recomendadas$/, async () => {

  await searchScreen.validateRecommendedOrder();
});
