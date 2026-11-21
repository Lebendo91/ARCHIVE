import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import { getAppInfo } from './app';
import { callCommand, CommandError, isNativeRuntime } from './tauri';
import { MOCK_APP_INFO } from '@/test/render';

describe('callCommand', () => {
  it('fails with an explicit error outside the desktop runtime', async () => {
    expect(isNativeRuntime()).toBe(false);
    await expect(callCommand('app_info')).rejects.toMatchObject({
      name: 'CommandError',
      code: 'native_runtime_unavailable',
      command: 'app_info',
    });
  });

  it('returns the result of the native command', async () => {
    mockIPC((command) => (command === 'app_info' ? MOCK_APP_INFO : undefined));
    await expect(getAppInfo()).resolves.toEqual(MOCK_APP_INFO);
  });

  it('normalizes native errors into CommandError', async () => {
    mockIPC(() => {
      // Tauri rejects with the serialized error value of the command: a plain object, not an Error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw { code: 'invalid_input', message: 'Bad input' };
    });
    const error: unknown = await callCommand('app_info').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CommandError);
    expect(error).toMatchObject({ code: 'invalid_input', message: 'Bad input' });
  });
});
