async function testApi() {
  const workflowId = '29f6bb7f-3b61-44f6-b44a-19b192e6ee56'
  const url = `http://localhost:3000/api/flow/session/${workflowId}/simulation-tree`
  
  console.log(`POST ${url}`)
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'simulate-range' })
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Error status:', res.status, text)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  console.log('Stream open. Listening to chunks...')

  while (true) {
    const { done, value } = await reader.read()
    if (value) {
      const chunk = decoder.decode(value)
      console.log('CHUNK:', chunk)
    }
    if (done) break
  }
}

testApi().catch(console.error)
