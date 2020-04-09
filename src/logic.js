const { randomBytes, createCipheriv, createDecipheriv } = require('crypto')

process.env.EMPIRE_CONFIG = 'type=CLIENT storageDriver=sql nodeList=https://empire.zacm.uk'
process.env.STORAGE_DIALECT = 'sqlite'

const { node } = require('z-empire')

const encrypt = (data, key) => {
  key = key || randomBytes(32)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([
    iv,
    cipher.update(data),
    cipher.final()
  ])
  return { key, encrypted }
}

const decrypt = ({ encrypted, key }) => {
  const iv = encrypted.slice(0, 16)
  const data = encrypted.slice(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([
    decipher.update(data),
    decipher.final()
  ])
}

const STORE_INFO = {
  STORAGE_KEY: process.env.SITE_STORAGE_KEY,
  get ENCRYPT_KEY() {
    return Buffer.from(process.env.SITE_ENCRYPT_KEY, 'hex')
  }
}

const getKeyStore = () => node.getData(STORE_INFO.STORAGE_KEY)
  .then(({ value }) => value)
  .then(value => {
    if (!value) {
      return { posts: [] }
    }
    return JSON.parse(decrypt({ encrypted: Buffer.from(value, 'hex'), key: STORE_INFO.ENCRYPT_KEY }).toString())
  })

const setKeyStore = data => node.updateData(STORE_INFO.STORAGE_KEY, encrypt(JSON.stringify(data), STORE_INFO.ENCRYPT_KEY).encrypted.toString('hex'))

const addPost = async ({ title, content, author }) => {
  await getPost(title)
    .catch(() => null)
    .then(post => {
      if (post) {
        throw new Error('Post already exists')
      }
    })
  const { key, encrypted } = encrypt(JSON.stringify({ content, author }))
  const { storageKey } = await node.setData(title, encrypted.toString('hex'))
  const store = await getKeyStore()
  store.posts.push({ title, key, storageKey })
  await setKeyStore(store)
}

const removePost = async title => {
  const store = await getKeyStore()
  const existingIndex = store.posts.findIndex(obj => obj.title === title)
  if (existingIndex > -1) {
    const { storageKey } = store.posts[existingIndex]
    await node.removeData(storageKey)
    store.posts.splice(existingIndex, 1)
    await setKeyStore(store)
  } else {
    throw new Error('Post not found')
  }
}

const updatePost = async ({ title, content, author }) => {
  await removePost(title)
  return addPost({ title, content, author })
}

const getPost = async title => {
  const store = await getKeyStore()
  const post = store.posts.find(obj => obj.title === title)
  if (!post) {
    throw new Error('Post not found')
  }

  const { storageKey, key } = post
  const postContent = await node.getData(storageKey)
  const encrypted = Buffer.from(postContent.value, 'hex')
  const decrypted = decrypt({ encrypted, key: Buffer.from(key, 'hex') }).toString()

  return JSON.parse(decrypted)
}

const getAllPosts = async () => {
  const store = await getKeyStore()
  const posts = []
  for (const { title } of store.posts) {
    posts.push({ title, ...await getPost(title) })
  }
  return posts
}

module.exports = {
  addPost,
  getPost,
  removePost,
  updatePost,
  getAllPosts
}
