import fs from 'fs'
import path from 'path'

const schemaDir = './prisma'
const outputFile = './src/generated/prisma/schema.prisma'

export const getMergedSchemaContent = async () => {
  const files = fs
    .readdirSync(schemaDir)
    .filter((file) => file.endsWith('.prisma'))

  let combinedContent = ''

  const mainSchema = fs.readFileSync(
    path.join(schemaDir, './schema.prisma'),
    'utf8',
  )
  combinedContent += mainSchema + '\n\n'

  files.forEach((file) => {
    if (file !== 'schema.prisma') {
      const content = fs.readFileSync(path.join(schemaDir, file), 'utf8')
      combinedContent += content + '\n\n'
    }
  })

  combinedContent = combinedContent.trim()

  return combinedContent
}

export const writeCombinedSchemaFile = async () => {
  const combinedContent = await getMergedSchemaContent()
  fs.writeFileSync(outputFile, combinedContent)
}
