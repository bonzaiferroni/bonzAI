export const notifier = {
    add(message: string) {
        console.log(message);
        Memory.notifier.push({time: Game.time, message: message});
    },

    review(limit = Number.MAX_VALUE, burnAfterReading = false) {
        let messageCount = Memory.notifier.length;

        let count = 0;
        for (let value of Memory.notifier) {
            let secondsElapsed = (Game.time - value.time) * 3;
            let seconds = secondsElapsed % 60;
            let minutes = Math.floor(secondsElapsed / 60);
            let hours = Math.floor(secondsElapsed / 3600);
            console.log(`\n${value.time} (roughly ${
                hours > 0 ? `${hours} hours, ` : ""}${
                minutes > 0 ? `${minutes} minutes, ` : ""}${
                seconds > 0 ? `${seconds} seconds ` : ""}ago)`);
            console.log(`${value.message}`);
            count++;
            if (count >= limit) { break; }
        }

        let destroyed = 0;
        if (burnAfterReading) {
            while (Memory.notifier.length > 0) {
                Memory.notifier.shift();
                destroyed++;
                if (destroyed >= limit) { break; }
            }
        }

        return `viewing ${count} of ${messageCount} notifications`
    },

    clear(term: string) {
        if (term) {
            let count = 0;
            term = term.toLocaleLowerCase();
            let newArray = [];
            for (let value of Memory.notifier) {
                if (value.message.toLocaleLowerCase().indexOf(term) < 0) {
                    newArray.push(value);
                    count++;
                }
                Memory.notifier = newArray;
            }

            return `removed ${count} messages;`
        }
        else {
            let count = Memory.notifier.length;
            Memory.notifier = [];
            return `removed ${count} messages;`
        }
    }
};