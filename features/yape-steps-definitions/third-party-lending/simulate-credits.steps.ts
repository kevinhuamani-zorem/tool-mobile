import { Then } from '@wdio/cucumber-framework';
import lendingSimulate from '@screenobjects/third-party-lending/simulate-amount.screen.ts';

Then(/^se ingresa y valida la sección de simulación de monto$/, async () => {
    await lendingSimulate.verifySimulateAmount();
});

Then(/^se simula un monto (\d+) de crédito disponible$/, async (amount: string) => {
    await lendingSimulate.lendingLoanAmount(amount);

    const amountNum = parseInt(amount);
    
    if (amountNum % 10 !== 0) {
        await lendingSimulate.verifyAmountErrorMessage();
    } else if (amountNum < 500 || amountNum > 12000) {
        await lendingSimulate.verifyAmountAllowedMessage();
    } else {
        await lendingSimulate.verifyAmountAllowedMessage();
        await lendingSimulate.clickSimulateAmountButton();
    }
});

Then(/^el usuario abandona el flujo de desembolso$/, async () => {
    await lendingSimulate.verifySimulateAbandon();
});
