/**
 * Build the official Yii login form as multipart/form-data.
 *
 * Chrome's authenticated login request uses multipart, not urlencoded.
 * This function does not log, persist, or transmit credentials by itself.
 * fetch/undici must set Content-Type with the generated boundary.
 */
export function buildERPLoginForm(
  csrf: string,
  username: string,
  password: string,
  captcha: string,
): FormData {
  const data=new FormData();
  data.append('_csrf',csrf);
  data.append('LoginForm[username]',username);
  data.append('LoginForm[password]',password);
  data.append('LoginForm[captcha]',captcha);
  data.append('LoginForm[qr_code]','');
  data.append('login-button','');
  return data;
}
