import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as glob from 'glob';

declare global {
  var selectedUser: any;
}

class ScenarioSession {
    public users: any[] = [];
    private selectedUser: any; // Variable para almacenar el usuario seleccionado

    // Singleton: asegúrar de que solo haya una instancia de ScenarioSession
    static instance: ScenarioSession = new ScenarioSession();

    private constructor() {} // Previene la creación de múltiples instancias

    // Método principal para cargar todos los datos desde los archivos YAML
    public loadInteroperableUsers(): void {
        console.log('Starting data loading...');

        // Cargar usuarios
        const testUsersDirectory = path.join(process.cwd(), 'resources/data/**/*.yml');
        const ymlFiles = glob.sync(testUsersDirectory);
        const usersList = this.getAllInteroperableUsersArray(ymlFiles);
        this.users = usersList; // Asigna el array plano directamente
        console.log(`Users loaded: ${this.users.length}`);
        console.log('Loading data completed.');
    }

    // Método para obtener los datos de cada archivo YAML y aplanar los arrays
    private getAllInteroperableUsersArray(ymlFiles: string[]): any[] {
        return ymlFiles.flatMap((filePath) => {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            console.log(`Loading file: ${filePath}`);
            return yaml.load(fileContent) || []; // Ensure to return an empty array if the content is null or undefined
        });
    }

    // Establece el usuario específico y lo almacena globalmente
    public setUserAs(userName: string): any {
        const user = this.findUser(userName);
        if (user) {
            this.selectedUser = user;
            global.selectedUser = user; // Almacena el usuario globalmente
        }
        return user;
    }

    // Método para buscar el usuario por nombre
    findUser(userName: string): any {
        if (!userName) {
            console.error('The user name is undefined or null');
            return undefined;
        }

        console.log(`Looking for user with name: ${userName.toUpperCase()}`);
        const foundUser = this.users.find((user: any) => {
            return user.name.toUpperCase() === userName.toUpperCase();
        });

        if (!foundUser) {
            console.error(`The user could not be found ${userName.toUpperCase()} in the loaded data`);
        } else {
            console.log(`User found: ${JSON.stringify(foundUser)}`);
        }

        return foundUser;
    }

    // Método para obtener el usuario seleccionado
    public getUser(): any {
        return this.selectedUser || global.selectedUser; // Retorna el usuario global o localmente almacenado
    }
}

// Exporta la única instancia de ScenarioSession
export const scenarioSession = ScenarioSession.instance;
