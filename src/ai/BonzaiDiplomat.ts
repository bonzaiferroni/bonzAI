import {Diplomat} from "./Diplomat";
export class BonzaiDiplomat extends Diplomat {

    public safe: {[username: string]: boolean};
    public danger: {[username: string]: boolean};

    constructor() {
        super();
        _.defaults(Memory.empire, {
            safe: {},
            danger: {},
        });
    }
}