import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@support/utils/LocatorFactory.ts';
import LocatorCreditPreview from '@resources/locators/third-party-lending/credit-preview.json' with { type: 'json' };
import LocatorLendingQuote from '@resources/locators/third-party-lending/quote-amount.json' with { type: 'json' };
import { TypeLocator } from '@support/utils/Enums.ts';
import { performScroll } from '@support/utils/Utils.ts';
import {
    PAUSES,
    SCROLL_CONFIGS,
    waitForElementToDisplay,
    waitForMultipleElements,
    scrollAndVerify
} from '@support/utils/tplending-utils.ts';

class LendingCreditPreviewScreen extends BaseScreen {

    public get btnTPLendingNextStep() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingNextStep,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingNextStep);
    }

    public get btnTPLendingConfirmation() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingConfirmation,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingConfirmation);
    }

    public get btnTPLendingPreAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingPreAmount,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingPreAmount);
    }

    public get btnTPLendingLoanGranted() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingLoanGranted,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingLoanGranted);
    }

    public get btnTPLendingLogo() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingLogo,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingLogo);
    }

    public get btnTPLendingOpenDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingFirstButton,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingFirstButton);
    }

    public get btnTPLendingMibancoYape()  {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMibancoYape,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMibancoYape);
    }

    public get btnTPLendingHowToPay() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingHowToPay,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingHowToPay);
    }

    public get btnTPLendingInstallments() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInstallments,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInstallments);
    }

    public get btnTPLendingLoanAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingLoanAmount,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingLoanAmount);
    }

    public get btnTPLendingPayDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingPayDate,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingPayDate);
    }

    public get btnTPLendingPayDay() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingPayDay,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingPayDay);
    }

    public get btnTPLendingFirstPay() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingFirstPay,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingFirstPay);
    }

    public get btnTPLendingTotalAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTotalAmount,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTotalAmount);
    }

    public get btnTPLendingTotalMoney() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTotalMoney,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTotalMoney);
    }

    public get btnTPLendingTextDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTextDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTextDetails);        
    }

    public get btnTPLendingMoreDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMoreDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMoreDetails);
    }

    public get btnTPLendingLoanDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingLoanDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingLoanDetails);
    }

    public get btnTPLendingAmountRequest() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingAmountRequest,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingAmountRequest);
    }

    public get btnTPLendingMoneyRequest() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMoneyRequest,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMoneyRequest);
    }

    public get btnTPLendingTotalInterest() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTotalInterest,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTotalInterest);
    }

    public get btnTPLendingAmountInterest() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingAmountInterest,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingAmountInterest);
    }

    public get btnTPLendingTaxAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTaxAmount,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTaxAmount);
    }

    public get btnTPLendingMoneyTax() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMoneyTax,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMoneyTax);
    }

    public get btnTPLendingItf() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingItf,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingItf);
    }

    public get btnTPLendingMoneyItf() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMoneyItf,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMoneyItf);
    }

    public get btnTPLendingFinalCredit() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingFinalCredit,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingFinalCredit);
    }

    public get btnTPLendingFinalAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingFinalAmount,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingFinalAmount);
    }

    public get btnTPLendingCloseCredit() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingCloseCredit,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingCloseCredit);
    }

    public get btnTPLendingLoanInformation() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingLoanInformation,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingLoanInformation);
    }

    public get btnTPLendingEmail() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingEmail,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingEmail);
    }

    public get btnTPLendingInsurance() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInsurance,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInsurance);
    }

    public get btnTPLendingInsuranceDetails()  {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInsuranceDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInsuranceDetails);
    }

    public get btnTPLendingSchedule() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingSchedule,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingSchedule);
    }

    public get btnTPLendingToKnowDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingToKnowDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingToKnowDetails);
    }

    public get btnTPLendingSummary() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingSummary,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingSummary);
    }

    public get btnTPLendingCreditDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingCreditDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingCreditDetails);
    }

    public get btnTPLendingAnualInterestRate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingAnualInterestRate,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingAnualInterestRate);
    }

    public get btnTPLendingTeaTcea() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTeaTcea,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTeaTcea);
    }

    public get btnTPLendingCloseTeaTcea() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingButton2,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingButton2);
    }

    public get btnTPLendingMortgageInsurance() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMortgageInsurance,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMortgageInsurance);
    }

    public get btnTPLendingCloseMortgage() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingButton3,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingButton3);        
    }

    public get btnTPLendingInterestRate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInterestRate,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInterestRate);
    }

    public get btnTPLendingTceaDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingTceaDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingTceaDetails);
    }

    public get btnTPLendingInsuranceRate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInsuranceRate,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInsuranceRate);
    }

    public get btnTPLendingMortgageDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMortgageDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMortgageDetails);
    }

    public get btnTPLendingInformation() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInformation,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInformation);
    }

    public get btnTPLendingConditions() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingConditions,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingConditions);
    }

    public get btnTPLendingConditionsDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingConditionsDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingConditionsDetails);
    }

    public get btnTPLendingMoreCost() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingMoreCost,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingMoreCost);
    }

    public get btnTPLendingCalendar() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingCalendar,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingCalendar);
    }

    public get btnTPLendingProcedure() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingProcedure,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingProcedure);
    }

    public get btnTPLendingProcedureDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingProcedureDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingProcedureDetails);
    }

    public get btnTPLendingCompany() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingCompany,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingCompany);
    }

    public get btnTPLendingOthersCompanies() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingOthersCompanies,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingOthersCompanies);
    }

    public get btnTPLendingCopyPolicy() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingCopyPolicy,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingCopyPolicy);
    }

    public get btnTPLendingPolicyDetails() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingPolicyDetails,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingPolicyDetails);
    }

    public get btnTPLendingInsuranceButton() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingInsuranceButton,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingInsuranceButton);
    }

    public get btnTPLendingAgreement() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorCreditPreview.creditPreviewIos.btnTPLendingAgreement,
                                        TypeLocator.XPATH, LocatorCreditPreview.creditPreviewAndroid.btnTPLendingAgreement);
    }

    public async clickContinueProcess(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingNextStep, 'click');
    }

    public async clickMibancoDetails(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingOpenDetails, 'click');
    }

    public async clickLoanMoreDetails(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingMoreDetails, 'click');
    }

    public async clickCloseDetails(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingCloseCredit, 'click');
    }

    public async clickInsuranceLabel(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingInsurance, 'click');
    }

    public async clickScheduleLabel(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingSchedule, 'click');
    }

    public async clickSummaryLabel(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingSummary, 'click');
    }

    public async clickCloseTeaTcea(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingCloseTeaTcea, 'click');
    }

    public async clickCloseMortgage(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingCloseMortgage, 'click');
    }

    public async clickInsuranceButton(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingInsuranceButton, 'click');
    }

    private async openLoanGranted(): Promise<void> {
        try {
            await waitForMultipleElements([
                this.btnTPLendingLoanGranted,
                this.btnTPLendingLogo
            ]);

            await this.clickMibancoDetails();
            await driver.pause(PAUSES.LONG);

            await waitForElementToDisplay(this.btnTPLendingMibancoYape);
        } catch (error) {
            console.error('Error opening loan granted section:', error);
            return;
        }
    }

    private async howToPayDetail(): Promise<void> {
        const elements = [
            this.btnTPLendingHowToPay,
            this.btnTPLendingInstallments,
            this.btnTPLendingLoanAmount,
            this.btnTPLendingPayDate,
            this.btnTPLendingPayDay,
            this.btnTPLendingFirstPay,
            this.btnTPLendingTotalAmount,
            this.btnTPLendingTotalMoney,
            this.btnTPLendingTextDetails
        ];

        await browser.waitUntil(
            async () => {
                await performScroll(
                    SCROLL_CONFIGS.creditPreview.howToPay.x1,
                    SCROLL_CONFIGS.creditPreview.howToPay.y1,
                    SCROLL_CONFIGS.creditPreview.howToPay.x2,
                    SCROLL_CONFIGS.creditPreview.howToPay.y2
                );
                for (const selector of elements) {
                    const el = await $(selector);
                    if (!(await el.isDisplayed())) {
                        return false;
                    }
                }
                return true;
            },
            {
                timeout: 20000,
                interval: PAUSES.MEDIUM,
                timeoutMsg: 'Not all payment details are displayed'
            }
        );
    }

    private async openMoreLoanDetails(): Promise<void> {
        try {
            await this.clickLoanMoreDetails();
            
            await waitForMultipleElements([
                this.btnTPLendingLoanDetails,
                this.btnTPLendingAmountRequest,
                this.btnTPLendingMoneyRequest,
                this.btnTPLendingTotalInterest,
                this.btnTPLendingAmountInterest,
                this.btnTPLendingTaxAmount,
                this.btnTPLendingMoneyTax,
                this.btnTPLendingItf,
                this.btnTPLendingMoneyItf,
                this.btnTPLendingFinalCredit,
                this.btnTPLendingFinalAmount
            ]);

            await this.clickCloseDetails();
            await driver.pause(PAUSES.LONG);
        } catch (error) {
            console.error('Error opening more loan details:', error);
            return;
        }
    }

    private async loanInformation(): Promise<void> {
        const elements = [
            this.btnTPLendingLoanInformation,
            this.btnTPLendingEmail
        ];

        await browser.waitUntil(
            async () => {
                await performScroll(
                    SCROLL_CONFIGS.creditPreview.loanInfo.x1,
                    SCROLL_CONFIGS.creditPreview.loanInfo.y1,
                    SCROLL_CONFIGS.creditPreview.loanInfo.x2,
                    SCROLL_CONFIGS.creditPreview.loanInfo.y2
                );
                for (const selector of elements) {
                    const el = await $(selector);
                    if (!(await el.isDisplayed())) {
                        return false;
                    }
                }
                return true;
            },
            {
                timeout: 20000,
                interval: PAUSES.MEDIUM,
                timeoutMsg: 'Loan information not displayed'
            }
        );
    }

    private async moveBetweenCarousel(): Promise<void> {
        try {
            await waitForMultipleElements([
                this.btnTPLendingInsurance,
                this.btnTPLendingInsuranceDetails
            ]);
            await driver.pause(PAUSES.SHORT);

            await scrollAndVerify(
                SCROLL_CONFIGS.creditPreview.carousel,
                [this.btnTPLendingSchedule, this.btnTPLendingToKnowDetails],
                PAUSES.MEDIUM
            );
            await driver.pause(PAUSES.SHORT);

            await scrollAndVerify(
                SCROLL_CONFIGS.creditPreview.carousel,
                [this.btnTPLendingSummary, this.btnTPLendingCreditDetails],
                PAUSES.MEDIUM
            );
        } catch (error) {
            console.error('Error navigating carousel:', error);
            return;
        }
    }

    private async openAnualInterestRate(): Promise<void> {
        try {
            await waitForElementToDisplay(this.btnTPLendingTeaTcea);

            await this.clickCloseTeaTcea();
            await driver.pause(PAUSES.LONG);

            await waitForMultipleElements([
                this.btnTPLendingInterestRate,
                this.btnTPLendingTceaDetails
            ]);

            await this.clickCloseDetails();
            await driver.pause(PAUSES.LONG);
        } catch (error) {
            console.error('Error opening annual interest rate:', error);
            return;
        }
    }

    private async openMortgageInsurance(): Promise<void> {
        try {
            await waitForElementToDisplay(this.btnTPLendingMortgageInsurance);

            await this.clickCloseMortgage();
            await driver.pause(PAUSES.LONG);

            await waitForMultipleElements([
                this.btnTPLendingInsuranceRate,
                this.btnTPLendingMortgageDetails
            ]);
            
            await scrollAndVerify(
                SCROLL_CONFIGS.creditPreview.mortgageInfo,
                [
                    this.btnTPLendingInformation,
                    this.btnTPLendingConditions,
                    this.btnTPLendingConditionsDetails
                ],
                PAUSES.LONG
            );
            
            await scrollAndVerify(
                SCROLL_CONFIGS.creditPreview.mortgageDetails,
                [
                    this.btnTPLendingMoreCost,
                    this.btnTPLendingCalendar,
                    this.btnTPLendingProcedure,
                    this.btnTPLendingProcedureDetails,
                    this.btnTPLendingCompany,
                    this.btnTPLendingOthersCompanies
                ],
                PAUSES.LONG
            );

            await scrollAndVerify(
                SCROLL_CONFIGS.creditPreview.mortgageDetails,
                [
                    this.btnTPLendingCopyPolicy,
                    this.btnTPLendingOthersCompanies,
                    this.btnTPLendingCopyPolicy
                ],
                PAUSES.SHORT
            );

            await performScroll(
                SCROLL_CONFIGS.creditPreview.mortgageDetails.x1,
                SCROLL_CONFIGS.creditPreview.mortgageDetails.y1,
                SCROLL_CONFIGS.creditPreview.mortgageDetails.x2,
                SCROLL_CONFIGS.creditPreview.mortgageDetails.y2
            );
            await driver.pause(PAUSES.LONG);
            await waitForElementToDisplay(this.btnTPLendingPolicyDetails);

            await this.clickInsuranceButton();
            await driver.pause(PAUSES.LONG);
        } catch (error) {
            console.error('Error opening mortgage insurance:', error);
            return;
        }
    }

    private async navigateToCreditPreview(): Promise<void> {
        await this.clickContinueProcess();
        await waitForMultipleElements([
            this.btnTPLendingConfirmation,
            this.btnTPLendingPreAmount
        ]);
    }

    private async verifyLoanDetails(): Promise<void> {
        await this.openLoanGranted();
        await driver.pause(PAUSES.MEDIUM);
        await this.howToPayDetail();
        await this.openMoreLoanDetails();
        await driver.pause(PAUSES.MEDIUM);
    }

    private async verifyCarouselElements(): Promise<void> {
        await this.loanInformation();
        await this.moveBetweenCarousel();
        await driver.pause(PAUSES.MEDIUM);
    }

    private async verifyInsuranceOptions(): Promise<void> {
        await waitForElementToDisplay(this.btnTPLendingAnualInterestRate);
        await this.openAnualInterestRate();
        await driver.pause(PAUSES.MEDIUM);
        await this.openMortgageInsurance();
        await driver.pause(PAUSES.MEDIUM);
    }

    private async verifyFinalAgreement(): Promise<void> {
        await waitForElementToDisplay(this.btnTPLendingAgreement);
        await driver.pause(PAUSES.LONG);
    }

    public async verifyCreditPreview(): Promise<void> {
        try {
            await this.navigateToCreditPreview();
            await this.verifyLoanDetails();
            await this.verifyCarouselElements();
            await this.verifyInsuranceOptions();
            await this.verifyFinalAgreement();
        } catch (error) {
            const errorObj = error as Error;
            console.error('Error verifying credit preview:', {
                message: errorObj.message,
                stack: errorObj.stack,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
}
export default new LendingCreditPreviewScreen();
