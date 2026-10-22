import { Fragment } from 'react';
import { css } from '@/lib/dc';
import { MONO } from '@/screens/live/ui';

const KEY = '#6AA6FF';
const STEP = '#FFC14D';
const COMMENT = '#6F7C94';
const TEXT = '#EAF0FA';

/** One YAML line with the design's colors: keys blue, plain steps amber, comments grey. Text only, never HTML. */
function Line({ text }: { text: string }) {
  const key = /^(\s*(?:- )?)([\w-]+)(:)(.*)$/.exec(text);
  if (key) {
    return (
      <>
        <span style={css(`color: ${TEXT}`)}>{key[1]}</span>
        <span style={css(`color: ${KEY}`)}>{key[2]}</span>
        <span style={css(`color: ${TEXT}`)}>{key[3]}</span>
        <span style={css(`color: ${TEXT}`)}>{key[4]}</span>
      </>
    );
  }
  if (/^\s*- /.test(text)) return <span style={css(`color: ${STEP}`)}>{text}</span>;
  if (/^\s*#/.test(text)) return <span style={css(`color: ${COMMENT}`)}>{text}</span>;
  return <span style={css(`color: ${TEXT}`)}>{text}</span>;
}

/** The flow file as it will be written, with the lines the engine flagged highlighted. */
export function YamlPane({ source, warnLines, errorLines }: { source: string; warnLines: ReadonlySet<number>; errorLines: ReadonlySet<number> }) {
  const lines = source.replace(/\n$/, '').split('\n');
  return (
    <div
      role="region"
      aria-label="Flow file preview"
      style={css(`background: #05080D; padding: 16px 0; overflow-x: auto; font-family: ${MONO}; font-size: 13px; line-height: 1.85`)}
    >
      {lines.map((text, i) => {
        const n = i + 1;
        const bg = errorLines.has(n)
          ? 'background: rgba(255,107,91,0.14); box-shadow: inset 3px 0 0 #FF6B5B'
          : warnLines.has(n)
            ? 'background: rgba(255,193,77,0.13); box-shadow: inset 3px 0 0 #FFC14D'
            : '';
        return (
          <Fragment key={n}>
            <div style={css(`display: flex; align-items: flex-start; ${bg}`)}>
              <span aria-hidden="true" style={css('flex: 0 0 48px; text-align: right; padding-right: 18px; color: #4D586D; box-sizing: border-box')}>{n}</span>
              <span style={css('white-space: pre')}>
                <Line text={text} />
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
