// Isolated native request construction; no launcher, Oracle home, database or network.
package oracle.patch.updater;
import java.lang.reflect.Method;
import oracle.patch.config.PatchConfigBuilder;
import oracle.patch.config.PatchSettingsGear;
import oracle.patch.config.links.DeriveConfigValues;
import oracle.patch.config.platform.AruPlatformDetails;
import oracle.commonx.utils.pojos.RACPojo;

public class DownloadTargetProbe {
    public static void main(String[] args) throws Exception {
        for (boolean withSource : new boolean[]{true, false}) {
            PatchSettingsGear gear = new PatchSettingsGear();
            gear.setBuildInfo(java.util.Collections.singletonMap("build.supported_target_versions", "19,21,23"));
            gear.setLogger(oracle.commons.helpers.Utilities.getNoLoggingLogger());
            PatchConfigBuilder builder = new PatchConfigBuilder().setGear(gear, "media").targetMajorVersion(26)
                .aruPlatformDetails(AruPlatformDetails.LINUX_X64)
                .sourceCluster(RACPojo.getDefaultInstance("NONE", "localhost"));
            if (withSource) builder.sourceVersion("19.0.0.0.0");
            gear.setBuilderMap(java.util.Collections.singletonMap("media", builder));
            Method derive = DeriveConfigValues.class.getDeclaredMethod("deriveSourceVersion", PatchSettingsGear.class);
            derive.setAccessible(true);
            derive.invoke(DeriveConfigValues.afterQueries(), gear);
            String request = new String(UpdateRequestBuilder.fromConfigBuilder(builder, RequestMode.DOWNLOAD_IMAGE).getRequestJSON());
            String expected = withSource ? "19" : "23";
            if (!request.contains("\"version\": \"" + expected + "\"")) throw new AssertionError(request);
            System.out.println("PASS target=26, source=" + (withSource ? "19" : "omitted") + " -> OUA request version=" + expected);
        }
    }
}
