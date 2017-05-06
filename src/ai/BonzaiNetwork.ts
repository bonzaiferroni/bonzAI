import {TradeNetwork} from "./TradeNetwork";
import {notifier} from "../notifier";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {WorldMap} from "./WorldMap";
export class BonzaiNetwork extends TradeNetwork {

    private diplomat: BonzaiDiplomat;

    constructor(map: WorldMap, diplomat: BonzaiDiplomat) {
        super(map);
        this.diplomat = diplomat;
    }

    protected decipher(item: Transaction) {
        if (!item.description) {
        notifier.log(`EMPIRE: no description on decipher from ${item.sender.username}.`);
        return;
        }
        let description = item.description.toLocaleLowerCase();
        if (description === "safe") {
            this.diplomat.safe[item.sender.username] = true;
            notifier.log(`EMPIRE: ${item.sender.username} requested to be added to safe list`);
        } else if (description === "removesafe") {
            delete this.diplomat.safe[item.sender.username];
            notifier.log(`EMPIRE: ${item.sender.username} requested to be removed from safe list`);
        } else if (description === "danger") {
            this.diplomat.danger[item.sender.username] = true;
            notifier.log(`EMPIRE: ${item.sender.username} requested to be added to danger list`);
        } else if (description === "removedanger") {
            delete this.diplomat.danger[item.sender.username];
            notifier.log(`EMPIRE: ${item.sender.username} requested to be removed from danger list`);
        } else {
            notifier.log(`EMPIRE: invalid description on decipher from ${item.sender.username}: ${_.escape(item.description)}`);
        }
    }

    protected processTransaction(item: Transaction) {
        if (item.amount === 111) {
            this.decipher(item);
        }
    }
}
