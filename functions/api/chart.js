export async function onRequest() {
  const targetUrl = "https://www.tjmedia.com/chart/top100";
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "TJ 미디어 서버 응답 오류" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const html = await response.text();
    
    // 서버에서 HTML을 그대로 전달 (클라이언트에서 파싱)
    return new Response(JSON.stringify({ contents: html }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
