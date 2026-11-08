class AuthError extends Error {
  constructor(code, message) { super(message); this.name = 'AuthError'; this.code = code; }
}
function publicError(error) {
  if (error instanceof AuthError) return { code: error.code, message: error.message };
  const code = error?.errorCode;
  if (['interaction_required','invalid_grant','login_required','consent_required','no_tokens_found','token_refresh_required'].includes(code)) return { code: 'sign_in_required', message: '로그인 유효기간이 만료되었습니다. 다시 로그인해 주세요.' };
  if (code === 'access_denied') return { code: 'access_denied', message: 'Microsoft 로그인이 취소되었거나 동의가 거부되었습니다.' };
  if (['invalid_client','unauthorized_client','invalid_scope','invalid_resource'].includes(code)) return { code: 'app_configuration', message: 'Microsoft 앱 등록의 계정 유형, 리디렉션 URI와 권한 설정을 확인해 주세요.' };
  if (error?.name === 'AbortError') return { code: 'cancelled', message: '로그인을 취소했습니다.' };
  if (error?.name === 'TimeoutError') return { code: 'network_timeout', message: '인증 서버의 응답 시간이 초과되었습니다. 다시 시도해 주세요.' };
  // Never expose raw SDK exceptions, URLs, response bodies or token-bearing headers to the renderer.
  return { code: 'authentication_failed', message: '인증을 완료하지 못했습니다. 인터넷 연결과 앱 등록 설정을 확인한 뒤 다시 시도해 주세요.' };
}
module.exports = { AuthError, publicError };
