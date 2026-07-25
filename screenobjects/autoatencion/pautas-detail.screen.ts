import LocatorFactory from "../../support/utils/LocatorFactory.ts";
import BaseScreen from "../commons/base.screen.ts";
import { $ } from '@wdio/globals'
import LocatorAutoAtentionPautaDetail from 'resources/locators/autoatencion/pautasdetail.locator.json' with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.ts";

class AutoAtentionPautasDetailScreen extends BaseScreen {

    public async validatePautaDetail(option: string){
        const pautaDetailTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblDetailPauta.replace("{option}",option),
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblDetailPauta.replace("{option}",option)
        );

        const pautaDetailTypeText = $(pautaDetailTypeLocator);
        await expect(pautaDetailTypeText).toBeDisplayed(); 
    }

    public async validateQuestion(){
        const questionTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblSectionQuestion,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblSectionQuestion
        );

        const questionTypeText = $(questionTypeLocator);
        await expect(questionTypeText).toBeDisplayed(); 
    }

    public async validateAnswerNO(){
        const answerTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.btnOptionNO,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.btnOptionNO
        );

        const answerTypeButton = $(answerTypeLocator);
        await expect(answerTypeButton).toBeDisplayed(); 
    }

    public async validateAnswerSI(){
        const answerTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.btnOptionSI,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.btnOptionSI
        );

        const answerTypeButton = $(answerTypeLocator);
        await expect(answerTypeButton).toBeDisplayed(); 
    }

    public get getBtnBack() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorAutoAtentionPautaDetail.Ios.btnBack,
            TypeLocator.XPATH, LocatorAutoAtentionPautaDetail.Android.btnBack);
    }

    public async selectOption(option: string){

        if(option == "NO"){
            const answerTypeLocator = LocatorFactory.getElement(
                TypeLocator.XPATH, 
                LocatorAutoAtentionPautaDetail.Ios.btnOptionNO,
                TypeLocator.XPATH, 
                LocatorAutoAtentionPautaDetail.Android.btnOptionNO
            );
            const answerTypeButton = $(answerTypeLocator);
            await answerTypeButton.click();
        } else if (option == "SI"){
            const answerTypeLocator = LocatorFactory.getElement(
                TypeLocator.XPATH, 
                LocatorAutoAtentionPautaDetail.Ios.btnOptionSI,
                TypeLocator.XPATH, 
                LocatorAutoAtentionPautaDetail.Android.btnOptionSI
            );
            const answerTypeButton = $(answerTypeLocator);
            await answerTypeButton.click();
        }
    }

    public async validateHideSectionQuestion(){
        const questionTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblSectionQuestion,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblSectionQuestion
        );

        const questionTypeText = $(questionTypeLocator);
        await expect(questionTypeText).not.toBeDisplayed(); 
    }

    public async validateAnswerMsg(text: string){
        const answerMsgSiTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblAnswer.replace("{option}",text),
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblAnswer.replace("{option}",text)
        );

        const answerMsgSiTypeText = $(answerMsgSiTypeLocator);
        await expect(answerMsgSiTypeText).toBeDisplayed(); 
    }

    public async validateBtnHablarAsesor(){
        const lblAsesorTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblAsesor,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblAsesor
        );

        const lblAsesorTypeButton = $(lblAsesorTypeLocator);
        await expect(lblAsesorTypeButton).toBeDisplayed(); 
    }

    public async selectBack(){
        const element = $(this.getBtnBack);
        await element.click();
    }

    public async validateNotAnswerMsg(text: string){
        const answerMsgSiTypeLocator = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblAnswer.replace("{option}",text),
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblAnswer.replace("{option}",text)
        );

        const answerMsgSiTypeText = $(answerMsgSiTypeLocator);
        await expect(answerMsgSiTypeText).not.toBeDisplayed(); 
    }

    public async validateBottomSheetVisible() {
        const selector = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblQuestionNo,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblQuestionNo
        );
        await expect($(selector)).toBeDisplayed();
    }

    public async validateButtonVisible() {
        const selector = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.btnHablarAsesor,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.btnHablarAsesor
        );
        await expect($(selector)).toBeDisplayed();
    }


    public async waitForBottomSheetToDisappear(text: string) {
        const selector = `//android.widget.TextView[@text='${text}']`;
        await $(selector).waitForDisplayed({ reverse: true, timeout: 5000 });
    }

    public async validateStillOnDetailScreen() {
        const selector = LocatorFactory.getElement(
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Ios.lblScreenNumberError,
            TypeLocator.XPATH, 
            LocatorAutoAtentionPautaDetail.Android.lblScreenNumberError
        );
        await expect($(selector)).toBeDisplayed(); 
    }

}

export default new AutoAtentionPautasDetailScreen();