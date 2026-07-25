import {IWorldOptions, setWorldConstructor, World} from "@wdio/cucumber-framework";
import {DataHelperCda} from './data-helper-cda.js';

export class CustomWorld extends World {
    dataHelperCda : DataHelperCda;

    constructor(options: IWorldOptions) {
        super(options);
        this.dataHelperCda = new DataHelperCda();

    }

}

setWorldConstructor(CustomWorld);
