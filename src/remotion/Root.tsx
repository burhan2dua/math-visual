import { Composition } from "remotion";
import { templates } from "../templates/generated";

export const RemotionRoot = () => (
  <>
    {templates.map(({ id, component: Component, data }) => {
      const fps = data.fps ?? 30;
      return (
        <Composition
          key={id}
          id={id}
          component={Component}
          durationInFrames={Math.round(data.durationInSeconds * fps)}
          fps={fps}
          width={data.width ?? 1920}
          height={data.height ?? 1080}
          defaultProps={{ data }}
          calculateMetadata={({ props }) => {
            const f = props.data.fps ?? 30;
            return {
              durationInFrames: Math.round(props.data.durationInSeconds * f),
              fps: f,
              width: props.data.width ?? 1920,
              height: props.data.height ?? 1080,
            };
          }}
        />
      );
    })}
  </>
);