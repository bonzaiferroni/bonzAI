export class Visualizer {

    private visuals: {[roomName: string]: string[] } = {};

    public add(roomName: string, text: string) {
        if (!this.visuals[roomName]) { this.visuals[roomName] = []; }
        this.visuals[roomName].push(text);
    }

    public finalize() {
        for (let roomName in this.visuals) {
            let nextPos = { x: 2, y: 2 };
            let customFlag = Game.flags[`visuals_${roomName}`];
            if (customFlag) {
                nextPos.x = customFlag.pos.x;
                nextPos.y = customFlag.pos.y;
            }
            for (let text of this.visuals[roomName]) {
                new RoomVisual(roomName).text(text, nextPos.x, nextPos.y);
                nextPos.y++;
            }
        }
    }
}