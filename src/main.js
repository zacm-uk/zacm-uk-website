const { createServer } = require('http')
const { join } = require('path')

require('dotenv').config()

const st = require('st')
const mount = st({ path: join(__dirname, '../public'), index: 'index.html' })

const { addPost, getPost, removePost, updatePost, getAllPosts } = require('./logic')

const base64Auth = (request, response) => {
  const [ , header ] = (request.headers.authorization || '').split('Basic ')
  const [ username, password ] = Buffer.from(header, 'base64').toString().split(':')
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    return true
  }
  response.statusCode = 401
  response.setHeader('content-type', 'application/json')
  response.write(JSON.stringify({ message: 'Unauthorised' }))
  response.end()
}

const routes = {
  'GET /posts': async ({ response }) => {
    response.setHeader('content-type', 'application/json')
    response.write(JSON.stringify(await getAllPosts()))
    response.end()
  },

  'GET /post': async ({ response, params }) => {
    const title = params.get('title')
    if (!title) {
      throw new Error('No title')
    }
    response.setHeader('content-type', 'application/json')
    response.write(JSON.stringify(await getPost(title)))
    response.end()
  },

  'POST /post': async ({ request, response, body }) => {
    if (!base64Auth(request, response)) {
      return
    }
    const { title, content, author } = body
    await addPost({ title, content, author })
    response.statusCode = 204
    response.end()
  },

  'PUT /post': async ({ request, response, body }) => {
    if (!base64Auth(request, response)) {
      return
    }
    const { title, content, author } = body
    await updatePost({ title, content, author })
    response.statusCode = 204
    response.end()
  },

  'DELETE /post': async ({ request, response, params }) => {
    if (!base64Auth(request, response)) {
      return
    }
    const title = params.get('title')
    if (!title) {
      throw new Error('No title')
    }
    await removePost(title)
    response.statusCode = 204
    response.end()
  }
}

createServer((request, response) => {
  const [ path ] = request.url.split('?')
  const params = new URLSearchParams(request.url.replace(path, ''))
  const route = routes[`${ request.method } ${ path }`]

  if (!route) {
    if (path === '/') {
      request.url = request.url.replace('/', '/index.html')
    }
    if (path === '/admin') {
      request.url = request.url.replace('/admin', '/admin.html')
    }
    mount(request, response)
    return
  }

  let data = ''
  request.on('data', chunk => data += chunk)

  request.on('end', () => {
    Promise.resolve()
      .then(() => {
        const contentType = request.headers['content-type'] || ''
        if (/json/.test(contentType)) {
          data = JSON.parse(data)
        }
      })
      .then(() => route({ request, response, path, params, body: data }))
      .catch(error => {
        response.statusCode = 500
        response.setHeader('content-type', 'application/json')
        response.write(JSON.stringify({ error: error.message }))
        response.end()
      })
  })
}).listen(process.env.PORT || 3001, () => console.log(`Listening on ${ process.env.PORT || 3001 }`))
