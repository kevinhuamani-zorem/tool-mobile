import LocatorProvider from '@common/locators/locator-provider.js';
import { $, $$ } from '@wdio/globals';
import LocatorMovements from '@locators/payment/movements.locator.json' with { type: 'json' };
import { TypeLocator } from '@common/enums/locator-type.enum.js';
import { parseMovementDate, isWithinLastDays } from '@utils/payment.js';
import { Assertions } from '@common/assertions/assertions.ts';

class MovementsScreen {
    private gestureHelper!: { scrollDown(): Promise<void> };

    private async validateOldestMovementWithinDays(days: number, maxScrolls: number = 15): Promise<void> {
        const rawDate: string = await this.scrollToOldestMovement(maxScrolls);
        const movementDate: Date | null = parseMovementDate(rawDate);

        if (movementDate === null) {
            throw new Error(`Unable to parse the movement date from the label: "${rawDate}"`);
        }

        Assertions.isBoolean(
            isWithinLastDays(movementDate, days),
            true,
            `The oldest movement date "${rawDate}" is not within the last ${days} days`
        );
    }

    private async scrollToOldestMovement(maxScrolls: number): Promise<string> {
        let previousSignature = '';
        let stableScrolls = 0;
        let oldestDate = '';

        for (let attempt = 0; attempt < maxScrolls; attempt++) {
            const visibleDates: string[] = await this.getVisibleMovementDates();

            if (visibleDates.length === 0) {
                await this.gestureHelper.scrollDown();
                continue;
            }

            const currentSignature: string = visibleDates.join('|');
            oldestDate = visibleDates[visibleDates.length - 1];

            if (currentSignature === previousSignature) {
                stableScrolls++;
            } else {
                stableScrolls = 0;
            }

            if (stableScrolls >= 2) {
                return oldestDate;
            }

            previousSignature = currentSignature;
            await this.gestureHelper.scrollDown();
        }

        if (oldestDate === '') {
            throw new Error(`No movement date was found after ${maxScrolls} scroll attempts`);
        }

        throw new Error(`The movement list did not reach a stable end after ${maxScrolls} scroll attempts`);
    }

    private async getVisibleMovementDates(): Promise<string[]> {
        const dateElements = await this.movementDates.getElements();

        if (dateElements.length === 0) {
            return [];
        }

        return Promise.all(
            Array.from(dateElements).map(async (element) => (await element.getText()).trim())
        );
    }

    public get movementDates() {
        const locator = LocatorProvider.getElement(TypeLocator.XPATH, LocatorMovements.movementsIos.movementDates, TypeLocator.ANDROID, LocatorMovements.movementsAndroid.movementDates);
        return $$(locator);
    }

    public get last15DaysOption() {
        const locator = LocatorProvider.getElement(TypeLocator.XPATH, LocatorMovements.movementsIos.last15DaysOption, TypeLocator.ANDROID, LocatorMovements.movementsAndroid.last15DaysOption);
        return $(locator);
    }

    public async userViewMovementsLast30DaysConfirmaDateMostrada(): Promise<void> {
        await this.validateOldestMovementWithinDays(30, 40);
    }

    public async userViewMovementsLast90DaysConfirmaDateMostrada(): Promise<void> {
        await this.validateOldestMovementWithinDays(90, 80);
    }
}

export default new MovementsScreen();
