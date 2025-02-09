mport React, { useEffect, useRef } from "react"

const Comments = () => {
  const commentRef = useRef(null)

  useEffect(() => {
    const giscus = document.createElement("script")

    const giscusConfig = {
      "src": "https://giscus.app/client.js",
      "data-repo": "ChanghwanK/ChanghwanK.github.io",
      "data-repo-id": "R_kgDONmHyzg",
      "data-category": "Comments",
      "data-category-id": "DIC_kwDONmHyzs4CmuyR",
      "data-mapping": "pathname",
      "data-strict": "0",
      "data-reactions-enabled": "1",
      "data-emit-metadata": "0",
      "data-input-position": "top",
      "data-theme": "preferred_color_scheme",
      "data-lang": "ko",
      "data-loading": "lazy",
      "crossorigin": "anonymous",
      "async": true
    }

    Object.entries(giscusConfig).forEach(([key, value]) => {
      giscus.setAttribute(key, value)
    })

    commentRef.current.appendChild(giscus)
  }, [])

  return (
    <div ref={commentRef} />
  )
}

export default Comments