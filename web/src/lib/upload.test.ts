import { describe, expect, it } from 'vitest';
import { createMockApi } from './api/mock';
import { createSupabaseApi } from './api/supabase';
import { failureView } from './job-display';
import { MAX_UPLOAD_BYTES, checkUploadFile } from './upload';

const JOB_ID = '22222222-2222-4222-8222-222222222222';
const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

describe('checkUploadFile', () => {
  it('영상 형식은 형식이나 확장자로 알아본다', () => {
    expect(checkUploadFile(file('a.mp4', 'video/mp4'))).toEqual({ ok: true, ext: 'mp4', mime: 'video/mp4' });
    expect(checkUploadFile(file('a.MOV', ''))).toEqual({ ok: true, ext: 'mov', mime: 'video/quicktime' });
    expect(checkUploadFile(file('a.webm', 'video/webm'))).toEqual({ ok: true, ext: 'webm', mime: 'video/webm' });
    // 목록에 없는 형식이면 버킷이 거부하므로 확장자로 정한 형식을 쓴다
    expect(checkUploadFile(file('a.mov', 'application/octet-stream'))).toEqual({ ok: true, ext: 'mov', mime: 'video/quicktime' });
  });

  it('영상이 아니거나 비었거나 25MB를 넘으면 거부한다', () => {
    expect(checkUploadFile(file('a.png', 'image/png'))).toEqual({ ok: false, reason: 'type' });
    expect(checkUploadFile(file('a.mp4', 'video/mp4', 0))).toEqual({ ok: false, reason: 'empty' });
    expect(checkUploadFile({ name: 'a.mp4', type: 'video/mp4', size: MAX_UPLOAD_BYTES + 1 })).toEqual({ ok: false, reason: 'size' });
  });
});

describe('createSupabaseApi 업로드', () => {
  function setup(replies: { storage?: number; rpc?: unknown; run?: unknown }) {
    const sent: { url: string; method: string; type: string | null; apikey: string | null; body: unknown }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sent.push({ url: String(url), method: init?.method ?? 'GET', type: headers.get('content-type'), apikey: headers.get('apikey'), body: init?.body });
      if (String(url).includes('/storage/')) return new Response('{}', { status: replies.storage ?? 200 });
      if (String(url).endsWith('/get_run')) return new Response(JSON.stringify(replies.run));
      return new Response(JSON.stringify(replies.rpc));
    }) as typeof fetch;
    const base = createMockApi({ latencyMs: 0, storage: null, navigate: () => {} });
    return { api: createSupabaseApi(base, { url: 'https://demo.supabase.co/', anonKey: 'anon-key', fetchImpl, storage: null }), sent };
  }

  it('비공개 버킷 incoming/<uuid>에 올린 뒤 그 경로로 job을 만든다', async () => {
    const { api, sent } = setup({ rpc: JOB_ID });
    const video = file('내 영상.mp4', 'video/mp4');
    expect(await api.createUploadJob(video)).toEqual({ jobId: JOB_ID });

    const [put, rpc] = sent;
    expect(put.url).toMatch(/^https:\/\/demo\.supabase\.co\/storage\/v1\/object\/uploads\/incoming\/[0-9a-f-]{36}\.mp4$/);
    expect(put).toMatchObject({ method: 'POST', type: 'video/mp4', apikey: 'anon-key', body: video });
    const path = put.url.split('/uploads/')[1];
    expect(rpc.url).toBe('https://demo.supabase.co/rest/v1/rpc/create_upload_job');
    expect(JSON.parse(String(rpc.body))).toEqual({ p_upload_path: path });
  });

  it('올리기가 실패하면 job을 만들지 않는다', async () => {
    const { api, sent } = setup({ storage: 413 });
    await expect(api.createUploadJob(file('a.mp4', 'video/mp4'))).rejects.toThrow('upload 413');
    expect(sent).toHaveLength(1);
  });

  it('업로드로 만든 결과는 열 원본 링크가 없다', async () => {
    const row = { id: JOB_ID, source_url: 'upload:0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e', recipe: {}, created_at: '2026-10-31T00:00:00Z' };
    const { api } = setup({ run: [row] });
    expect((await api.getRun(JOB_ID))?.sourceUrl).toBe('');
  });
});

describe('failureView 업로드', () => {
  const ctx = { loggedIn: false, canRetry: false, uploadReady: true };

  it('업로드한 파일이 실패하면 [영상 파일로 넣기] 대신 [다른 파일 올리기]', () => {
    const job = { errorCode: 'unavailable' as const, reason: 'not_playable', runId: null };
    expect(failureView(job, ctx).actions).toEqual(['upload', 'other_link']);
    expect(failureView(job, { ...ctx, fromUpload: true }).actions).toEqual(['other_file', 'other_link']);
  });

  it('업로드한 파일은 원본이 지워져서 [다시 시도] 대신 [다른 파일 올리기]', () => {
    const view = (errorCode: 'retryable' | 'internal', reason: string) =>
      failureView({ errorCode, reason, runId: null }, { ...ctx, loggedIn: true, canRetry: true, fromUpload: true }).actions;
    expect(view('retryable', 'asr_transient')).toEqual(['other_file', 'other_link']);
    expect(view('internal', 'asr_config')).toEqual(['other_file', 'go_book']);
  });

  it('업로드 실패 reason마다 안내가 있다', () => {
    const titles = ['no_speech', 'upload_too_large', 'upload_unreadable', 'upload_missing'].map(
      (reason) => failureView({ errorCode: 'unavailable', reason, runId: null }, { ...ctx, fromUpload: true }).title,
    );
    expect(titles).toEqual(['영상에서 말소리를 찾지 못했어요', '파일이 너무 커요', '영상 파일을 읽을 수 없어요', '영상 파일을 읽을 수 없어요']);
  });

  it('링크 job에는 [다른 파일 올리기]가 나오지 않는다', () => {
    const job = { errorCode: 'unavailable' as const, reason: 'no_speech', runId: null };
    expect(failureView(job, ctx).actions).toEqual(['other_link']);
  });
});
