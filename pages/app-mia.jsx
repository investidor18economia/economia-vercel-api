import Head from "next/head";
import MIAChat from "../components/MIAChat";
import MIALanding from "../components/MIALanding";
import TeilorBrandHero from "../components/TeilorBrandHero";

export default function AppMIA() {
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
      </Head>
      <div className="app-mia-page">
        <div className="app-mia-shell">
          <div className="app-mia-column">
            <div className="app-mia-hero-shell">
              <div className="app-mia-hero-shell-inner">
                <TeilorBrandHero />
              </div>
            </div>
            <div className="app-mia-chat-wrap">
              <MIAChat />
            </div>
          </div>
        </div>
        <div className="app-mia-landing-wrap">
          <MIALanding />
        </div>
      </div>
    </>
  );
}
