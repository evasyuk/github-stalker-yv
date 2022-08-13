import { GoogleSpreadsheet } from 'google-spreadsheet'
import { getSheetsCredentials } from '../../helper/meta'
import { SHEETS_ID } from '../../helper/_AppConfigGenerated'

const ROWS_ABC = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('')

class BaseTab {
    constructor(parentDOC, sheetId) {
        this.sheetId = sheetId
        this.parentDOC = parentDOC

        this.headerRow = null

        this.ready = false
    }

    init = async () => {
        const [_, sheet, headerRow] = await BaseTab.getSheetInfo(this.parentDOC, this.sheetId)
        this.sheet = sheet
        this.headerRow = headerRow

        await this.sheet.loadCells({ // GridRange object
            startRowIndex: 0, endRowIndex: 10, startColumnIndex:0, endColumnIndex: 10
        })

        this.ready = true
    }

    _readRow = async (rIndex, startC = 0, endC = 10) => {
        let row = []
        let internalIndex = 0

        const magic = 10

        const range = `${ROWS_ABC[startC]}${(rIndex - magic) < 1 ? 1 : (rIndex - magic)}:${ROWS_ABC[endC + magic]}${rIndex + magic}`
        await this.sheet.loadCells(range)

        for (let cIndex = startC; cIndex <= endC; cIndex += 1, internalIndex += 1) {
            const cell = await this.sheet.getCell(rIndex, cIndex)
            row[internalIndex] = {
                formattedValue: cell.formattedValue,
                value: cell.value,
                valueType: cell.valueType,
                rIndex,
                cIndex,
            }
        }

        return row
    }

    _writeRow = async (rIndex, row) => {
        let internalIndex = 0

        let startC = 0, endC = row.length || 10

        const magic = 10

        const range = `${ROWS_ABC[startC]}${(rIndex - magic) < 1 ? 1 : (rIndex - magic)}:${ROWS_ABC[endC + magic]}${rIndex + magic}`
        await this.sheet.loadCells(range)

        for (let cIndex = startC; cIndex <= endC; cIndex += 1, internalIndex += 1) {
            const cell = await this.sheet.getCell(rIndex, cIndex)
            cell.value = row[cIndex]
            if (cIndex === 0) {
                cell.note = 'updated automatically'
            }
        }

        await this.sheet.saveUpdatedCells(); // save all updates in one call
    }

    _readColumn = async (cIndex, startR = 1, endR = 10) => {
        let column = []
        let internalIndex = 0

        const range = `${ROWS_ABC[cIndex]}${startR}:${ROWS_ABC[cIndex]}${endR}`

        await this.sheet.loadCells(range)

        for (let rIndex = startR; rIndex < endR; rIndex += 1, internalIndex += 1) {
            const cell = await this.sheet.getCell(rIndex, cIndex)
            column[internalIndex] = {
                formattedValue: cell.formattedValue,
                value: cell.value,
                valueType: cell.valueType,
                rIndex,
                cIndex,
            }
        }
        return column
    }

    getRealRow = async (rIndex) => {
        const row = await this._readRow(rIndex, 0, this.headerRow.length)

        return {
            headerRow: this.headerRow,
            rIndex,
            row,
        }
    }

    updateRow = async (rIndex, realObject) => {
        const row = []
        const existingRow = await this.getRealRow(rIndex)

        existingRow.headerRow.forEach((key) => {
            row.push(realObject[key])
        })

        await this._writeRow(rIndex, row)
    }

    getObjectById = async (rIndex) => {
        let result = {}
        const row = await this.getRealRow(rIndex)

        row.headerRow.forEach((key, index) => {
            result[key] = row.row[index].value
        })

        return {
            rIndex,
            value: result,
        }
    }

    getObjectsById = async (indexes) => {
        let finalResult = []

        const promises = indexes.map(async (rIndex) => {
            let result = {}
            const row = await this.getRealRow(rIndex)

            row.headerRow.forEach((key, index) => {
                result[key] = row.row[index].value
            })

            return {
                rIndex,
                value: result,
            }
        })

        finalResult = await Promise.all(promises)

        return finalResult
    }

    getRealColumn = async (cIndex) => {
        const header = await this.sheet.getCell(0, cIndex).value
        const values = []

        let shouldStop = false

        let step = 10
        let startR = 1, endR = 50000
        while (!shouldStop) {
            const interimValues = await this._readColumn(cIndex, startR, startR + step)

            for (let index = 0; index < interimValues.length; index += 1) {
                const item = interimValues[index]
                if (item.value !== null) {
                    values.push(item)
                } else {
                    shouldStop = true
                    break
                }
            }

            startR = startR + step

            if (!shouldStop) {
                shouldStop = startR >= endR
            } else {
                break
            }
        }
        return {
            header,
            values,
            cIndex,
        }
    }

    static getSheetInfo = async (myDoc, sheetId = 0) => {
        return new Promise((resolve, reject) => {
            const sheet = myDoc.sheetsByIndex[sheetId]
            sheet.loadHeaderRow()
                .then(() => {
                    resolve([sheetId, sheet, sheet.headerValues])
                })
                .catch((err) => {
                    reject(err)
                })
        })
    }
}

class UserTab extends BaseTab {
    findExistingUser = async (user) => {
        const id = user.id

        // await this.sheet.loadCells({ // GridRange object
        //   startRowIndex: 0, endRowIndex: 10, startColumnIndex:0, endColumnIndex: 10
        // })

        const column_id = await this.getRealColumn(0)

        const found = column_id.values.find((it) => it.formattedValue == id)

        if (found) {
            const objMeta = await this.getObjectById(found.rIndex)
            return [objMeta.rIndex, objMeta.value]
        }

        return [null, null]
    }

    addUser = async (user) => {
        const [rIndex, realUser] = await this.findExistingUser(user)

        if (rIndex) {
            return realUser
        }

        await this.sheet.addRow(user)
        return realUser
    }

    toggleSubscription = async (user, key) => {
        const [rIndex, realUser] = await this.findExistingUser(user)

        const updatedUser = Object.assign({}, realUser, { [key]: !realUser[key] })
        await this.updateRow(rIndex, updatedUser)

        return updatedUser
    }
}

class EventsTab extends BaseTab {
    queryEventsByDate = async (date = '12/11/2020') => {
        const column_date = await this.getRealColumn(0)

        const itemIds = column_date.values
            .filter((it) => it.formattedValue == date)
            .map((it) => it.rIndex)

        let realItems = await this.getObjectsById(itemIds)
        realItems = realItems.filter((it) => !(it.value.disabled === true))

        return realItems
    }

    queryEventsInRange = async (startDate, endDate) => {
        return []
    }
}

class DaylightTab extends BaseTab {
    queryEventsByDate = async (date = '12/11/2020') => {
        const column_date = await this.getRealColumn(0)

        const itemIds = column_date.values
            .filter((it) => it.formattedValue == date)
            .map((it) => it.rIndex)

        let realItems = await this.getObjectsById(itemIds)
        realItems = realItems.filter((it) => !(it.value.disabled === true))

        return realItems
    }
}

class MySheets {
    constructor(doc_id) {
        this.DOC = null
        this.doc_id = doc_id

        this.daylightSheet = null
        this.eventsSheet = null
        this.userSheet = null

        this.ready = false
    }

    init = async () => {
        this.DOC = new GoogleSpreadsheet(this.doc_id)
        // use service account credentials
        await this.DOC.useServiceAccountAuth(getSheetsCredentials())

        await this.DOC.loadInfo() // loads document properties and worksheets

        this.eventsSheet = new EventsTab(this.DOC, 0)
        this.userSheet = new UserTab(this.DOC, 1)
        this.daylightSheet = new DaylightTab(this.DOC, 2)

        await this.eventsSheet.init()
        await this.userSheet.init()
        await this.daylightSheet.init()

        this.ready = true
    }

    waitForInit = async () => {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (this.ready) {
                    clearInterval(interval)
                    resolve()
                }
            }, 1000)
        })
    }
}

const mySheet = new MySheets(SHEETS_ID);

(async () => {
    await mySheet.init()
})()

export {
    mySheet,
}