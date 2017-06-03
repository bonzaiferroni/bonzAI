import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";

interface SignMemory extends MissionMemory {
    text: string;
}

export class SignMission extends Mission {

    public memory: SignMemory;

    public signers: Agent[];
    constructor(operation: Operation) {
        super(operation, "signer");
    }

    protected init() {
    }

    protected update() {
    }

    public roleCall() {
        this.signers = this.headCount("RoomSigner", () => this.workerBody(0, 0, 1), () => 1, {blindSpawn: true});
    }

    protected actions() {
        for (let signer of this.signers) { this.signerActions(signer); }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    private signerActions(signer: Agent) {
        if (!this.memory.text) {
            console.log("Set a Sign Text: " + this.name + ".memory.signer.text = xy;");
            return;
        }

        if (this.memory.text !== undefined && this.memory.text.length > 100) {
            console.log("Set Sign Text is to long.");
            return;
        }

        if (!this.state.hasVision) {
            signer.travelTo(this.flag);
        } else if (!signer.pos.isNearTo(this.room.controller)) {
            signer.travelTo(this.flag.room.controller.pos);
        }
        if (this.state.hasVision && signer.pos.isNearTo(this.room.controller) &&
            (!this.room.controller.sign || this.room.controller.sign.text !== this.memory.text) ) {
            signer.creep.signController(this.flag.room.controller, this.memory.text);
        }
        if (this.state.hasVision && this.room.controller.sign &&
            this.room.controller.sign.text === this.memory.text) {
            console.log("Signer Operation complete.");
            this.flag.memory = undefined;
            this.flag.remove();
        }
    }
}