import {Guru} from "../missions/Guru";
export class DefenseGuru extends Guru {

    _hostiles: Creep[];

    get hostiles(): Creep[] {
        if (!this._hostiles) {
            this._hostiles = _.filter(this.room.hostiles, (c: Creep) => {
                return c.owner.username !== "Invader" && c.body.length >= 40 && _.filter(c.body, part => part.boost).length > 0;
            });

            let fauxHostiles = _.filter(this.room.find(FIND_FLAGS), (f: Flag) => f.name.indexOf("faux") >= 0);
            if (fauxHostiles.length > 0) {
                this._hostiles = fauxHostiles as Creep[];
            }
        }
        return this._hostiles;
    }
}