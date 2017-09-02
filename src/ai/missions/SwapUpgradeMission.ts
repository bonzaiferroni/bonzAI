import {UpgradeMission} from "./UpgradeMission";
export class SwapUpgradeMission extends UpgradeMission {

    protected findControllerBattery() {
        if (this.room.storage) {
            return this.room.storage;
        } else {
            return super.findControllerBattery();
        }
    }

    protected maxCarts = () => {
        if (this.room.storage) {
            return 0;
        } else {
            return super.maxCarts();
        }
    };

    protected upgraderBody = () => {
        return this.workerBody(30, 5, 15);
    };

    protected maxUpgraders = () => {
        if (this.room.controller.level >= 6) {
            if (this.room.controller.ticksToDowngrade < 20000) {
                // TEMPORARY
                return 1;
            } else {
                return 0;
            }
        }
        return super.maxUpgraders();
    };

    protected getPotency() {
        if (this.state.battery instanceof StructureStorage) {
            return Math.floor(this.room.storage.store.energy / 1500);
        } else {
            return super.getPotency();
        }
    }
}