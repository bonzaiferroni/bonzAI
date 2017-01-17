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
        this.safe = Memory.empire.safe;
        this.danger = Memory.empire.danger;
    }
}