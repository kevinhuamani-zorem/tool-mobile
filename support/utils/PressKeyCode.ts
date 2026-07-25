class PressKeyCode {
    values: { [key: string]: number } = {
        '0': 7,
        '1': 8,
        '2': 9,
        '3': 10,
        '4': 11,
        '5': 12,
        '6': 13,
        '7': 14,
        '8': 15,
        '9': 16,
        a: 29,
        b: 30,
        c: 31,
        d: 32,
        e: 33,
        f: 34,
        g: 35,
        h: 36,
        i: 37,
        j: 38,
        k: 39,
        l: 40,
        m: 41,
        n: 42,
        o: 43,
        p: 44,
        q: 45,
        r: 46,
        s: 47,
        t: 48,
        u: 49,
        v: 50,
        w: 51,
        x: 52,
        y: 53,
        z: 54,
        A: 29,
        B: 30,
        C: 31,
        D: 32,
        E: 33,
        F: 34,
        G: 35,
        H: 36,
        I: 37,
        J: 38,
        K: 39,
        L: 40,
        M: 41,
        N: 42,
        O: 43,
        P: 44,
        Q: 45,
        R: 46,
        S: 47,
        T: 48,
        U: 49,
        V: 50,
        W: 51,
        X: 52,
        Y: 53,
        Z: 54,
        ' ': 62,
    };

    async enterTextWithKeyCode(driver: WebdriverIO.Browser, text: string): Promise<void> {
        for (const char of text) {
            const keyCode = this.values[char];
            if (keyCode !== undefined) {
                await driver.pressKeyCode(keyCode);
            } else {
                console.warn(
                    `Character not found in the code map: ${char}`
                );
            }
        }
    }
}

export default PressKeyCode;
