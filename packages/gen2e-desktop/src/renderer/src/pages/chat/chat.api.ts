export const invokeModel = async (prompt: string): Promise<ReadableStream | null> => {
  return await fetch(`${import.meta.env.VITE_API_HOST}/generate`, {
    method: 'POST',
    body: JSON.stringify({ prompt: prompt }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then((response) => response.body)
    .catch((error) => {
      console.error(error)
      return null
    })
}
