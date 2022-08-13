const fs = require('fs')

export const getProjectName = () => {
    const dirPath = `${__dirname}/../../..`
    const frcPath = `${dirPath}/.firebaserc`

    try {
        const jsonString = fs.readFileSync(frcPath)
        const firebaserc = JSON.parse(jsonString)

        return firebaserc.projects.default
    } catch (error) {
        throw error
    }
}

export const getSheetsCredentials = () => {
    const dirPath = `${__dirname}/../..`
    const crdPath = `${dirPath}/credentials-sheet.json`

    return require(crdPath)
}