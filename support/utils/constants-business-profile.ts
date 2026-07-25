
export class BusinessProfileConstants {

    static yapeEmpresaProfiles: Set<string> = new Set(['29', '30', '31', '36', '37']);

     /**
     * @returns {boolean} 
     */
    static isYapeEmpresaProfile(perfil: string): boolean {
        return this.yapeEmpresaProfiles.has(perfil?.trim());
    }
}
