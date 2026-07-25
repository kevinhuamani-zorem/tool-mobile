import { When, Then } from '@wdio/cucumber-framework';
import miPlanScreen from '../../../screenobjects/nexus/miplanyapeempresa.screen.ts';

When(
    /^hace clic en la opción Mi plan yape empresa del menu$/,
    async () => {
        await miPlanScreen.selectMenuOptionMiPlanEmpresa();
    }
);

Then(
    /^se debe mostrar la fecha de afiliación a yape empresa$/,
    async () => {
        await miPlanScreen.validateFechaAfiliacionVisible();
    }
);

Then(
    /^el Cobro por comisión$/,
    async () => {
        await miPlanScreen.validateCobroComisionVisible();
    }
);